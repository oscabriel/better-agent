import { env } from "cloudflare:workers";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import type { LanguageModelUsage } from "ai";
import {
	convertToModelMessages,
	generateId,
	smoothStream,
	stepCountIs,
	streamText,
} from "ai";
import type { UserDurableObject } from "@/server/db/do/user-durable-object";
import { createUserProviderRegistry } from "@/server/features/models/user-registry-factory";
import { resolveModelProvider } from "@/server/features/models/utils";
import { getUserSettings } from "@/server/features/settings/queries";
import { getBuiltInMCPServers } from "@/server/features/tools/mcp/catalog";
import {
	closeMCPClients,
	getMCPTools,
} from "@/server/features/tools/mcp/client";
import { getCustomMcpServers } from "@/server/features/tools/mcp/queries";
import {
	createWebSearchTool,
	isWebSearchEnabled,
} from "@/server/features/tools/web-search";
import {
	recordUsage,
	requireAvailableQuota,
} from "@/server/features/usage/handlers";
import { MAX_MESSAGE_LENGTH, MAX_PROMPT_MESSAGES } from "./constants";
import {
	extractMessageText,
	mergeHistoryWithIncoming,
	normalizeMessage,
	validateIncomingMessages,
} from "./messages";
import { buildSystemPrompt } from "./prompts";
import { maybeGenerateConversationTitle } from "./title-generation";
import type { AppUIMessage } from "./types";

export async function streamCompletion(
	userId: string,
	userDOStub: DurableObjectStub<UserDurableObject>,
	params: {
		messages: unknown[];
		conversationId: string;
		modelId?: string;
	},
) {
	const {
		messages: rawMessages,
		conversationId,
		modelId: requestedModelId,
	} = params;

	const incomingMessages: AppUIMessage[] =
		await validateIncomingMessages(rawMessages);

	const userSettings = await getUserSettings(userId);
	const modelId = requestedModelId || userSettings.selectedModel;
	const provider = modelId.split(":")[0];

	await requireAvailableQuota(userId, provider, userSettings.apiKeys || {});

	const resolvedProvider = resolveModelProvider(modelId, userSettings.apiKeys);

	const userRegistry = createUserProviderRegistry(userSettings.apiKeys || {}, {
		enabled: userSettings.reasoningEffort !== "off",
		effort:
			userSettings.reasoningEffort === "off"
				? "medium"
				: userSettings.reasoningEffort,
	});

	const customServers = await getCustomMcpServers(userId);
	const enabledBuiltInIds = userSettings.enabledMcpServers || [];

	const enabledMCPServers = [
		...getBuiltInMCPServers().filter((server) =>
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
		await userDOStub.upsertConversation(conversationId);
		await userDOStub.appendMessages(conversationId, [lastIncoming]);
	}

	const history = (await userDOStub.listMessages(
		conversationId,
		MAX_PROMPT_MESSAGES,
	)) as { items: AppUIMessage[]; nextCursor: number | null };

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
				responseMessage as import("ai").UIMessage,
			);

			const hasText =
				extractMessageText(normalizedResponse)
					.slice(0, MAX_MESSAGE_LENGTH)
					.trim().length > 0;

			if (hasText) {
				await userDOStub.appendMessages(conversationId, [normalizedResponse]);
			}

			const google = createGoogleGenerativeAI({
				apiKey: env.GOOGLE_GENERATIVE_AI_API_KEY,
			});
			await maybeGenerateConversationTitle({
				userDOStub,
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
				await recordUsage(userId, {
					modelId,
					usage: usageData,
					conversationId,
				});
			}
		},
	});

	return response;
}
