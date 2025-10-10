import { env } from "cloudflare:workers";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import type { LanguageModelUsage, UIMessage } from "ai";
import {
	convertToModelMessages,
	generateId,
	smoothStream,
	stepCountIs,
	streamText,
} from "ai";
import type { AppUIMessage } from "@/server/domain/ui-messages";
import type { UserDurableObject } from "@/server/infra/do/user-durable-object";
import { getCustomMcpServers } from "@/server/repositories/d1/mcp-repository";
import { ConversationRepository } from "@/server/repositories/do/conversation-repository";
import {
	closeMCPClients,
	getMCPTools,
} from "@/server/services/mcp/mcp-client-service";
import { BUILT_IN_MCP_SERVERS } from "@/server/services/mcp/mcp-server-manager";
import { getModelDefinition } from "@/server/services/models/model-catalog";
import { resolveModelProvider } from "@/server/services/providers/model-resolver";
import { createUserProviderRegistry } from "@/server/services/providers/user-registry-factory";
import { UsageTrackingService } from "@/server/services/usage/usage-tracking-service";
import { UserSettingsService } from "@/server/services/users/user-settings-service";
import {
	createWebSearchTool,
	isWebSearchEnabled,
} from "@/server/services/web-search/web-search-service";
import {
	extractMessageText,
	MAX_MESSAGE_LENGTH,
	MAX_PROMPT_MESSAGES,
	mergeHistoryWithIncoming,
	normalizeMessage,
	validateIncomingMessages,
} from "./message-service";
import { buildSystemPrompt } from "./prompt-service";
import { maybeGenerateConversationTitle } from "./title-generation-service";

export class AICompletionService {
	private readonly conversationRepo: ConversationRepository;
	private readonly settingsService: UserSettingsService;
	private readonly usageService: UsageTrackingService;

	constructor(
		private readonly userId: string,
		readonly userDOStub: DurableObjectStub<UserDurableObject>,
	) {
		this.conversationRepo = new ConversationRepository(userDOStub);
		this.settingsService = new UserSettingsService();
		this.usageService = new UsageTrackingService();
	}

	async streamCompletion(params: {
		messages: unknown[];
		conversationId: string;
		modelId?: string;
	}) {
		const {
			messages: rawMessages,
			conversationId,
			modelId: requestedModelId,
		} = params;

		const incomingMessages: AppUIMessage[] =
			await validateIncomingMessages(rawMessages);

		const userSettings = await this.settingsService.getSettings(this.userId);
		const modelId = requestedModelId || userSettings.selectedModel;
		const provider = modelId.split(":")[0];

		await this.usageService.requireAvailableQuota(
			this.userId,
			provider,
			userSettings.apiKeys || {},
		);

		const resolvedProvider = resolveModelProvider(
			modelId,
			userSettings.apiKeys,
		);

		const userRegistry = createUserProviderRegistry(
			userSettings.apiKeys || {},
			{
				enabled: userSettings.reasoningEffort !== "off",
				effort:
					userSettings.reasoningEffort === "off"
						? "medium"
						: userSettings.reasoningEffort,
			},
		);

		const _modelDefinition = getModelDefinition(modelId);

		const customServers = await getCustomMcpServers(this.userId);
		const enabledBuiltInIds = userSettings.enabledMcpServers || [];

		const enabledMCPServers = [
			...BUILT_IN_MCP_SERVERS.filter((server) =>
				enabledBuiltInIds.includes(server.id),
			),
			...customServers
				.filter((server) => server.enabled)
				.map((server) => ({
					id: server.id,
					name: server.name,
					url: server.url,
					type: server.type,
					description: server.description || "",
					headers: server.headers,
					isBuiltIn: false as const,
				})),
		];

		const { tools: mcpTools, clients } = await getMCPTools(enabledMCPServers);

		const webSearchApiKey = userSettings.apiKeys?.exa;
		const hasWebSearch = isWebSearchEnabled(
			userSettings.webSearchEnabled,
			webSearchApiKey,
		);
		const webSearchTool = hasWebSearch
			? createWebSearchTool(webSearchApiKey || "")
			: null;

		const allTools = {
			...mcpTools,
			...(webSearchTool ? { webSearch: webSearchTool } : {}),
		};

		// biome-ignore lint/suspicious/noExplicitAny: Registry requires specific literal types but accepts any valid provider:model string at runtime
		const model = userRegistry.languageModel(resolvedProvider.modelId as any);

		const lastIncoming = incomingMessages[incomingMessages.length - 1];
		if (lastIncoming?.role === "user") {
			await this.conversationRepo.upsertConversation(conversationId);
			await this.conversationRepo.appendMessages(conversationId, [
				lastIncoming,
			]);
		}

		const history = await this.conversationRepo.listMessages(
			conversationId,
			MAX_PROMPT_MESSAGES,
		);

		const mergedUiMessages = mergeHistoryWithIncoming(
			history.items,
			incomingMessages,
		);

		const mergedForModel = mergedUiMessages.map(({ id, ...rest }) => rest);

		const systemPrompt = buildSystemPrompt(
			allTools,
			enabledMCPServers,
			hasWebSearch,
		);

		const result = streamText({
			model,
			system: systemPrompt,
			messages: convertToModelMessages(mergedForModel),
			// biome-ignore lint/suspicious/noExplicitAny: AI SDK tools type is complex and dynamically generated from MCP servers
			tools: Object.keys(allTools).length > 0 ? (allTools as any) : undefined,
			toolChoice: Object.keys(allTools).length > 0 ? "auto" : undefined,
			stopWhen: stepCountIs(5),
			experimental_transform: smoothStream(),
		});

		const self = this;

		const response = result.toUIMessageStreamResponse({
			// biome-ignore lint/suspicious/noExplicitAny: AI SDK type compatibility
			originalMessages: incomingMessages as any,
			generateMessageId: () => generateId(),
			sendReasoning: true,
			messageMetadata: ({
				part,
			}: {
				part: {
					type: string;
					usage?: LanguageModelUsage;
					totalUsage?: LanguageModelUsage;
				};
			}) => {
				const usageData = part.totalUsage || part.usage;

				if (part.type === "finish" && usageData) {
					const metadata = {
						usage: usageData,
						modelId,
					};
					return metadata;
				}
				return undefined;
			},
			async onFinish({ responseMessage }) {
				const normalizedResponse = normalizeMessage(
					responseMessage as UIMessage,
				);

				const hasText =
					extractMessageText(normalizedResponse)
						.slice(0, MAX_MESSAGE_LENGTH)
						.trim().length > 0;

				if (hasText) {
					await self.conversationRepo.appendMessages(conversationId, [
						normalizedResponse,
					]);
				}

				const google = createGoogleGenerativeAI({
					apiKey: env.GOOGLE_GENERATIVE_AI_API_KEY,
				});
				await maybeGenerateConversationTitle({
					repo: self.conversationRepo,
					model: google("gemini-2.5-flash-lite"),
					conversationId,
					uiMessages: incomingMessages,
					responseMessage: normalizedResponse,
				});

				await closeMCPClients(clients);

				const usageData =
					normalizedResponse.metadata?.usage ||
					(responseMessage as unknown as { usage?: LanguageModelUsage }).usage;

				if (usageData) {
					await self.usageService.recordUsage(self.userId, {
						modelId,
						usage: usageData,
						conversationId,
					});
				}
			},
		});

		// Add headers to prevent Cloudflare Workers from buffering the stream
		response.headers.set("Content-Type", "text/plain; charset=utf-8");
		response.headers.set("Cache-Control", "no-cache, no-transform");
		response.headers.set("Connection", "keep-alive");
		response.headers.set("X-Accel-Buffering", "no");

		return response;
	}
}
