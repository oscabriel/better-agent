import {
	resolveOwnedThinkspaceTurnModel,
	ThinkspaceTurnModelUnavailableError,
} from "@better-agent/api/models/readiness";
import {
	extractThinkspaceTurnResultText,
	mapThinkspaceTurnInspection,
	markThinkspaceTurnProductSafeError,
	validateThinkspaceTurnSubmissionId,
} from "@better-agent/api/thinkspaces/inspect";
import type {
	ThinkspaceTurnInspection,
	ThinkspaceTurnInspectionRequest,
} from "@better-agent/api/thinkspaces/inspect";
import { createPermissionStorePolicy } from "@better-agent/api/thinkspaces/permission-policy";
import type { ToolPotencyVerdict } from "@better-agent/api/thinkspaces/permission-policy";
import { assembleThinkspaceTurn } from "@better-agent/api/thinkspaces/turn-assembly";
import {
	createThinkspaceRuntimeToolSet,
	createThinkspaceRuntimeTurnConfig,
	THINKSPACE_RUNTIME_POLICY,
} from "@better-agent/api/thinkspaces/runtime-policy";
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

export class ThinkspaceAgent extends Think<CloudflareEnv> {
	private readonly runtimeToolSet: ToolSet = createThinkspaceRuntimeToolSet();
	private readonly turnModelPlaceholder: LanguageModel = UNRESOLVED_TURN_MODEL;
	private readonly turnSystemPrompt =
		"You are a Thinkspace Agent for Better Agent. Complete the user's bounded instruction directly and concisely. You have no tools available in this slice; respond with model output only.";

	override maxSteps = THINKSPACE_RUNTIME_POLICY.maxSteps;
	override workspaceBash = THINKSPACE_RUNTIME_POLICY.workspaceBash;

	/**
	 * HTTP/WebSocket entry to this runtime stays closed. Project Think serves
	 * unauthenticated routes (for example `/get-messages`) when a request
	 * reaches the Durable Object, so the only supported entry points are the
	 * owner-gated worker RPCs (`acceptTurnSubmission`, `inspectTurnSubmission`).
	 */
	// eslint-disable-next-line class-methods-use-this -- must stay an instance override to shadow the Agent HTTP entry point
	override fetch(_request: Request): Promise<Response> {
		return Promise.resolve(
			new Response("This Thinkspace Agent runtime is not directly accessible.", { status: 404 }),
		);
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
		const resultText =
			snapshot?.status === "completed"
				? extractThinkspaceTurnResultText(await this.getMessages())
				: null;

		return mapThinkspaceTurnInspection({
			resultText,
			snapshot,
			submissionId,
			thinkspaceId: request.thinkspaceId,
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
		const resolved = await this.resolveTurnModel(db, turnContext);
		const toolPotencies = await ThinkspaceAgent.evaluateToolPotencies(
			db,
			turnContext,
			resolved.activeRevision,
		);
		const assembly = assembleThinkspaceTurn({
			maxSteps: this.maxSteps,
			revision: resolved.activeRevision,
			toolPotencies,
		});

		return {
			...createThinkspaceRuntimeTurnConfig(),
			maxSteps: assembly.maxSteps,
			model: resolved.model,
			system: assembly.systemPrompt,
		};
	}

	/**
	 * Tool potency comes from the real store-backed Permission policy: the
	 * Thinkspace's granted Permissions decide which enabled tools become
	 * active, never the Profile alone. Evaluation failures stay product-safe.
	 */
	private static async evaluateToolPotencies(
		db: ProductDb,
		turnContext: ThinkspaceTurnRuntimeContext,
		activeRevision: NonNullable<
			Awaited<ReturnType<typeof resolveOwnedThinkspaceTurnModel>>
		>["activeRevision"],
	): Promise<ToolPotencyVerdict[]> {
		try {
			return await createPermissionStorePolicy({ db }).evaluateToolPotency({
				enablements: activeRevision.toolEnablements,
				thinkspaceId: turnContext.thinkspaceId,
			});
		} catch (error) {
			throw new Error(markThinkspaceTurnProductSafeError(PERMISSION_EVALUATION_FAILED_MESSAGE), {
				cause: error,
			});
		}
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
