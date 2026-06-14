import {
	resolveOwnedThinkspaceTurnModel,
	ThinkspaceTurnModelUnavailableError,
} from "@better-agent/api/models/readiness";
import {
	extractThinkspaceTurnResultText,
	extractThinkspaceTurnToolActivity,
	mapThinkspaceTurnInspection,
	markThinkspaceTurnProductSafeError,
	validateThinkspaceTurnSubmissionId,
} from "@better-agent/api/thinkspaces/inspect";
import type {
	ThinkspaceTurnInspection,
	ThinkspaceTurnInspectionRequest,
} from "@better-agent/api/thinkspaces/inspect";
import type { BuiltInMcpServer } from "@better-agent/api/mcp/catalog";
import { listBuiltInMcpServers } from "@better-agent/api/mcp/catalog";
import {
	assertThinkspaceRuntimePolicySupportsBuiltInTools,
	evaluateBuiltInRuntimeToolCallPermission,
	prepareThinkspaceBuiltInRuntimeTools,
	THINKSPACE_BUILT_IN_TOOL_BLOCKED_REASON,
} from "@better-agent/api/thinkspaces/built-in-runtime-tools";
import { createFetchWebReader } from "@better-agent/api/thinkspaces/web-reader";
import { createThinkspaceSourceReader } from "@better-agent/api/sources/reader";
import {
	createThinkspaceMcpDegradationNotice,
	evaluateMcpRuntimeToolCallPermission,
	planThinkspaceMcpRuntimeTools,
	prepareThinkspaceMcpRuntimeTools,
	THINKSPACE_MCP_TOOL_BLOCKED_REASON,
} from "@better-agent/api/thinkspaces/mcp-runtime-tools";
import { createPermissionStorePolicy } from "@better-agent/api/thinkspaces/permission-policy";
import type {
	ThinkspacePermissionPolicy,
	ToolPotencyVerdict,
} from "@better-agent/api/thinkspaces/permission-policy";
import { assembleThinkspaceTurn } from "@better-agent/api/thinkspaces/turn-assembly";
import {
	createThinkspaceRuntimeToolSet,
	createThinkspaceRuntimeTurnConfig,
	THINKSPACE_RUNTIME_POLICY,
} from "@better-agent/api/thinkspaces/runtime-policy";
import {
	createThinkspaceTurnAttribution,
	decodeSittingForwardContext,
	matchesSittingForwardContext,
	SITTING_FORWARD_CONTEXT_HEADER,
	SITTING_TURN_ATTRIBUTION_STORAGE_KEY,
} from "@better-agent/api/thinkspaces/sittings";
import {
	bindThinkspaceTurnRuntimeContext,
	matchesThinkspaceTurnRuntimeContext,
} from "@better-agent/api/thinkspaces/turn-context";
import type { ThinkspaceTurnRuntimeContext } from "@better-agent/api/thinkspaces/turn-context";
import {
	THINKSPACE_TURN_SOURCE,
	validateThinkspaceTurnIdempotencyKey,
	validateThinkspaceTurnInstruction,
} from "@better-agent/api/thinkspaces/turns";
import type {
	ThinkspaceTurnAcceptance,
	ThinkspaceTurnSubmissionRequest,
} from "@better-agent/api/thinkspaces/turns";
import { createDb } from "@better-agent/db";
import type { ProductDb } from "@better-agent/db";
import type { CloudflareEnv } from "@better-agent/env/types";
import { Think } from "@cloudflare/think";
import type {
	ChatErrorContext,
	ChatResponseResult,
	ToolCallContext,
	ToolCallDecision,
} from "@cloudflare/think";
import type { LanguageModel, ToolSet, UIMessage } from "ai";

const TURN_CONTEXT_STORAGE_KEY = "better-agent:turn-context";

/**
 * Placeholder returned by getModel(). Never used for inference: beforeTurn
 * always resolves the governed model from product configuration and
 * overrides it, or fails the turn with a product-safe error first.
 */
const UNRESOLVED_TURN_MODEL = "better-agent:turn-model-resolved-in-before-turn";

const MISSING_TURN_CONTEXT_MESSAGE =
	"This Thinkspace Agent turn is missing its Thinkspace context.";
const MISSING_THINKSPACE_MESSAGE =
	"This Thinkspace Agent turn could not verify its Thinkspace configuration.";
const PERMISSION_EVALUATION_FAILED_MESSAGE =
	"This Thinkspace Agent turn could not evaluate its Thinkspace tool Permissions.";

const toRuntimeMcpTransport = (transport: BuiltInMcpServer["transport"]) =>
	transport === "streamable_http" ? "streamable-http" : "sse";

export class ThinkspaceAgent extends Think<CloudflareEnv> {
	private readonly runtimeToolSet: ToolSet = createThinkspaceRuntimeToolSet();
	private readonly turnMcpServerIds = new Set<string>();
	private readonly turnModelPlaceholder: LanguageModel = UNRESOLVED_TURN_MODEL;
	private readonly turnSystemPrompt =
		"You are a Thinkspace Agent for Better Agent. Complete the user's bounded instruction directly and concisely. Tool availability is resolved per turn from the Thinkspace configuration.";

	override maxSteps = THINKSPACE_RUNTIME_POLICY.maxSteps;
	override workspaceBash = THINKSPACE_RUNTIME_POLICY.workspaceBash;

	/**
	 * HTTP/WebSocket entry stays fail-closed by default. Project Think serves
	 * unauthenticated routes (for example `/get-messages`) when a request reaches
	 * the Durable Object, so this override admits exactly one thing: a **Sitting**
	 * the worker has already authenticated and stamped with a forward context
	 * matching this runtime's bound (owner, Thinkspace). Project Think's chat
	 * protocol then provides streaming, multi-tab broadcast, stream resumption,
	 * cancellation, and the recovering indicator. Owner-gated RPCs
	 * (`acceptTurnSubmission`, `inspectTurnSubmission`) remain the path for
	 * programmatic turns. Everything else — direct hits, absent or mismatched
	 * context — stays 404, with no signal about whether the Thinkspace exists.
	 */
	override async fetch(request: Request): Promise<Response> {
		const forwardContext = decodeSittingForwardContext(
			request.headers.get(SITTING_FORWARD_CONTEXT_HEADER),
		);

		if (!forwardContext) {
			return ThinkspaceAgent.runtimeClosedResponse();
		}

		const existingContext =
			await this.ctx.storage.get<ThinkspaceTurnRuntimeContext>(TURN_CONTEXT_STORAGE_KEY);

		if (existingContext && !matchesSittingForwardContext(forwardContext, existingContext)) {
			return ThinkspaceAgent.runtimeClosedResponse();
		}

		await this.ctx.storage.put<ThinkspaceTurnRuntimeContext>(TURN_CONTEXT_STORAGE_KEY, {
			ownerUserId: forwardContext.ownerUserId,
			thinkspaceId: forwardContext.thinkspaceId,
		});

		return super.fetch(request);
	}

	private static runtimeClosedResponse(): Response {
		return new Response("This Thinkspace Agent runtime is not directly accessible.", {
			status: 404,
		});
	}

	override async onStart(): Promise<void> {
		await this.removeKnownBuiltInMcpServers();
	}

	async acceptTurnSubmission(
		request: ThinkspaceTurnSubmissionRequest,
	): Promise<ThinkspaceTurnAcceptance> {
		const instruction = validateThinkspaceTurnInstruction(request.instruction);
		const idempotencyKey = validateThinkspaceTurnIdempotencyKey(request.idempotencyKey);
		const turnContext = bindThinkspaceTurnRuntimeContext({
			existing: await this.ctx.storage.get<ThinkspaceTurnRuntimeContext>(TURN_CONTEXT_STORAGE_KEY),
			request: {
				ownerUserId: request.ownerUserId,
				thinkspaceId: request.thinkspaceId,
			},
		});

		await this.ctx.storage.put(TURN_CONTEXT_STORAGE_KEY, turnContext);

		const message: UIMessage = {
			id: crypto.randomUUID(),
			parts: [{ text: instruction, type: "text" }],
			role: "user",
		};
		const result = await this.submitMessages([message], {
			idempotencyKey,
			metadata: {
				profileRevisionId: request.profileRevisionId,
				profileVersion: request.profileVersion,
				source: THINKSPACE_TURN_SOURCE,
				thinkspaceId: request.thinkspaceId,
			},
		});

		return {
			acceptedAt: result.createdAt,
			deduplicated: !result.accepted,
			idempotencyKey,
			profileRevisionId: request.profileRevisionId,
			profileVersion: request.profileVersion,
			status: "accepted",
			submissionId: result.submissionId,
			thinkspaceId: request.thinkspaceId,
		};
	}

	async inspectTurnSubmission(
		request: ThinkspaceTurnInspectionRequest,
	): Promise<ThinkspaceTurnInspection> {
		const submissionId = validateThinkspaceTurnSubmissionId(request.submissionId);
		const turnContext =
			await this.ctx.storage.get<ThinkspaceTurnRuntimeContext>(TURN_CONTEXT_STORAGE_KEY);

		if (!matchesThinkspaceTurnRuntimeContext(turnContext, request.thinkspaceId)) {
			return mapThinkspaceTurnInspection({
				snapshot: null,
				submissionId,
				thinkspaceId: request.thinkspaceId,
			});
		}

		const snapshot = await this.inspectSubmission(submissionId);
		const messages = snapshot?.status === "completed" ? await this.getMessages() : null;

		return mapThinkspaceTurnInspection({
			resultText: messages ? extractThinkspaceTurnResultText(messages) : null,
			snapshot,
			submissionId,
			thinkspaceId: request.thinkspaceId,
			toolActivity: messages ? extractThinkspaceTurnToolActivity(messages) : [],
		});
	}

	override getModel(): LanguageModel {
		return this.turnModelPlaceholder;
	}

	override getSystemPrompt(): string {
		return this.turnSystemPrompt;
	}

	override getTools(): ToolSet {
		return this.runtimeToolSet;
	}

	override async beforeTurn() {
		const turnContext =
			await this.ctx.storage.get<ThinkspaceTurnRuntimeContext>(TURN_CONTEXT_STORAGE_KEY);

		if (!turnContext) {
			throw new Error(markThinkspaceTurnProductSafeError(MISSING_TURN_CONTEXT_MESSAGE));
		}

		const db = createDb(this.env.DB);
		const permissionPolicy = createPermissionStorePolicy({ db });
		const resolved = await this.resolveTurnModel(db, turnContext);

		// Attribution is recorded at turn resolution time from the active revision.
		// Submitted turns also carry it in their submission metadata; Sitting turns
		// do not pass through the ledger, so this preserves the activation-history
		// guarantee (every turn is attributable to the revision it ran under)
		// regardless of entry path, for the future Audit Trail.
		await this.ctx.storage.put(
			SITTING_TURN_ATTRIBUTION_STORAGE_KEY,
			createThinkspaceTurnAttribution(resolved.activeRevision),
		);

		const toolPotencies = await ThinkspaceAgent.evaluateToolPotencies(
			permissionPolicy,
			turnContext,
			resolved.activeRevision,
		);
		const assembly = assembleThinkspaceTurn({
			maxSteps: this.maxSteps,
			revision: resolved.activeRevision,
			toolPotencies,
		});
		assertThinkspaceRuntimePolicySupportsBuiltInTools({
			activeProductToolIds: assembly.activeTools,
		});

		const builtInPreparation = await prepareThinkspaceBuiltInRuntimeTools({
			activeProductToolIds: assembly.activeTools,
			sourceReader: createThinkspaceSourceReader({
				db,
				env: this.env,
				thinkspaceId: turnContext.thinkspaceId,
			}),
			webReader: createFetchWebReader(),
		});
		const mcpPlan = planThinkspaceMcpRuntimeTools({
			activeProductToolIds: assembly.activeTools,
			revision: resolved.activeRevision,
		});

		await this.removeKnownBuiltInMcpServers();

		const mcpPreparation = await prepareThinkspaceMcpRuntimeTools({
			activeProductToolIds: mcpPlan.activeProductToolIds,
			connectServer: ({ server }) => this.connectBuiltInMcpServerForTurn(server),
			servers: mcpPlan.servers,
		});
		const turnConfig = createThinkspaceRuntimeTurnConfig({
			activeTools: [...builtInPreparation.activeToolNames, ...mcpPreparation.activeToolNames],
		});
		const systemNotices = [
			builtInPreparation.sourceManifestNotice,
			createThinkspaceMcpDegradationNotice(mcpPreparation.degradedServers),
		].filter((notice): notice is string => notice !== null);

		return {
			...turnConfig,
			model: resolved.model,
			system: [assembly.systemPrompt, ...systemNotices].join("\n\n"),
			tools: { ...builtInPreparation.tools, ...mcpPreparation.tools },
		};
	}

	/**
	 * Tool potency comes from the real store-backed Permission policy: the
	 * Thinkspace's granted Permissions decide which enabled tools become
	 * active, never the Profile alone. Evaluation failures stay product-safe.
	 */
	private static async evaluateToolPotencies(
		permissionPolicy: ThinkspacePermissionPolicy,
		turnContext: ThinkspaceTurnRuntimeContext,
		activeRevision: NonNullable<
			Awaited<ReturnType<typeof resolveOwnedThinkspaceTurnModel>>
		>["activeRevision"],
	): Promise<ToolPotencyVerdict[]> {
		try {
			return await permissionPolicy.evaluateToolPotency({
				enablements: activeRevision.toolEnablements,
				thinkspaceId: turnContext.thinkspaceId,
			});
		} catch (error) {
			throw new Error(markThinkspaceTurnProductSafeError(PERMISSION_EVALUATION_FAILED_MESSAGE), {
				cause: error,
			});
		}
	}

	override async beforeToolCall(ctx: ToolCallContext): Promise<ToolCallDecision | undefined> {
		const turnContext =
			await this.ctx.storage.get<ThinkspaceTurnRuntimeContext>(TURN_CONTEXT_STORAGE_KEY);

		if (!turnContext) {
			return { action: "block", reason: THINKSPACE_MCP_TOOL_BLOCKED_REASON };
		}

		try {
			const db = createDb(this.env.DB);
			const resolved = await this.resolveTurnModel(db, turnContext);
			const permissionPolicy = createPermissionStorePolicy({ db });
			const builtInDecision = await evaluateBuiltInRuntimeToolCallPermission({
				permissionPolicy,
				revision: resolved.activeRevision,
				runtimeToolName: ctx.toolName,
				thinkspaceId: turnContext.thinkspaceId,
			});

			if (builtInDecision.applies) {
				if (builtInDecision.allowed) {
					return;
				}

				return {
					action: "block",
					reason: builtInDecision.reason ?? THINKSPACE_BUILT_IN_TOOL_BLOCKED_REASON,
				};
			}

			const decision = await evaluateMcpRuntimeToolCallPermission({
				permissionPolicy,
				revision: resolved.activeRevision,
				runtimeToolName: ctx.toolName,
				thinkspaceId: turnContext.thinkspaceId,
			});

			if (!(decision.applies && !decision.allowed)) {
				return;
			}

			return { action: "block", reason: decision.reason ?? THINKSPACE_MCP_TOOL_BLOCKED_REASON };
		} catch {
			return { action: "block", reason: THINKSPACE_MCP_TOOL_BLOCKED_REASON };
		}
	}

	override async onChatResponse(result: ChatResponseResult): Promise<void> {
		try {
			await this.cleanupTurnMcpServers();
		} finally {
			await super.onChatResponse(result);
		}
	}

	override onChatError(error: unknown, ctx?: ChatErrorContext): unknown {
		void this.cleanupTurnMcpServers();

		return super.onChatError(error, ctx);
	}

	private async connectBuiltInMcpServerForTurn(server: BuiltInMcpServer): Promise<ToolSet> {
		const result = await this.addMcpServer(server.name, server.url, {
			id: server.id,
			transport: { type: toRuntimeMcpTransport(server.transport) },
		});

		if (result.state !== "ready") {
			throw new Error("Granted external information source is not ready for this turn.");
		}

		this.turnMcpServerIds.add(result.id);

		return this.mcp.getAITools({ serverId: result.id, state: "ready" });
	}

	private async cleanupTurnMcpServers(): Promise<void> {
		const serverIds = [...this.turnMcpServerIds];
		this.turnMcpServerIds.clear();

		await Promise.all(
			serverIds.map((serverId) => this.removeMcpServer(serverId).catch(() => null)),
		);
	}

	private async removeKnownBuiltInMcpServers(): Promise<void> {
		const builtInServerIds = new Set(listBuiltInMcpServers().map((server) => server.id));
		const serverIds = Object.keys(this.getMcpServers().servers).filter((serverId) =>
			builtInServerIds.has(serverId),
		);

		for (const serverId of serverIds) {
			this.turnMcpServerIds.delete(serverId);
		}

		await Promise.all(
			serverIds.map((serverId) => this.removeMcpServer(serverId).catch(() => null)),
		);
	}

	private async resolveTurnModel(
		db: ProductDb,
		turnContext: ThinkspaceTurnRuntimeContext,
	): Promise<NonNullable<Awaited<ReturnType<typeof resolveOwnedThinkspaceTurnModel>>>> {
		let resolved: Awaited<ReturnType<typeof resolveOwnedThinkspaceTurnModel>>;

		try {
			resolved = await resolveOwnedThinkspaceTurnModel({
				db,
				env: this.env,
				ownerUserId: turnContext.ownerUserId,
				thinkspaceId: turnContext.thinkspaceId,
			});
		} catch (error) {
			const productSafeMessage =
				error instanceof ThinkspaceTurnModelUnavailableError
					? error.message
					: MISSING_THINKSPACE_MESSAGE;
			throw new Error(markThinkspaceTurnProductSafeError(productSafeMessage), { cause: error });
		}

		if (!resolved) {
			throw new Error(markThinkspaceTurnProductSafeError(MISSING_THINKSPACE_MESSAGE));
		}

		return resolved;
	}
}
