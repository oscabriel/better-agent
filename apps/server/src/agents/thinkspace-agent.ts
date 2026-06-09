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
import {
	createThinkspaceRuntimeToolSet,
	createThinkspaceRuntimeTurnConfig,
	THINKSPACE_RUNTIME_POLICY,
} from "@better-agent/api/thinkspaces/runtime-policy";
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

interface ThinkspaceTurnContext {
	ownerUserId: string;
	thinkspaceId: string;
}

export class ThinkspaceAgent extends Think<CloudflareEnv> {
	private readonly runtimeToolSet: ToolSet = createThinkspaceRuntimeToolSet();
	private readonly turnModelPlaceholder: LanguageModel = UNRESOLVED_TURN_MODEL;
	private readonly turnSystemPrompt =
		"You are a Thinkspace Agent for Better Agent. Complete the user's bounded instruction directly and concisely. You have no tools available in this slice; respond with model output only.";

	override maxSteps = THINKSPACE_RUNTIME_POLICY.maxSteps;
	override workspaceBash = THINKSPACE_RUNTIME_POLICY.workspaceBash;

	async acceptTurnSubmission(
		request: ThinkspaceTurnSubmissionRequest,
	): Promise<ThinkspaceTurnAcceptance> {
		const instruction = validateThinkspaceTurnInstruction(request.instruction);
		const idempotencyKey = validateThinkspaceTurnIdempotencyKey(request.idempotencyKey);
		const turnContext: ThinkspaceTurnContext = {
			ownerUserId: request.ownerUserId,
			thinkspaceId: request.thinkspaceId,
		};

		await this.ctx.storage.put(TURN_CONTEXT_STORAGE_KEY, turnContext);

		const message: UIMessage = {
			id: crypto.randomUUID(),
			parts: [{ text: instruction, type: "text" }],
			role: "user",
		};
		const result = await this.submitMessages([message], {
			idempotencyKey,
			metadata: { source: THINKSPACE_TURN_SOURCE, thinkspaceId: request.thinkspaceId },
		});

		return {
			acceptedAt: result.createdAt,
			deduplicated: !result.accepted,
			idempotencyKey,
			status: "accepted",
			submissionId: result.submissionId,
			thinkspaceId: request.thinkspaceId,
		};
	}

	async inspectTurnSubmission(
		request: ThinkspaceTurnInspectionRequest,
	): Promise<ThinkspaceTurnInspection> {
		const submissionId = validateThinkspaceTurnSubmissionId(request.submissionId);
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
		const turnContext = await this.ctx.storage.get<ThinkspaceTurnContext>(TURN_CONTEXT_STORAGE_KEY);

		if (!turnContext) {
			throw new Error(markThinkspaceTurnProductSafeError(MISSING_TURN_CONTEXT_MESSAGE));
		}

		const resolved = await this.resolveTurnModel(turnContext);

		return {
			...createThinkspaceRuntimeTurnConfig(),
			maxSteps: this.maxSteps,
			model: resolved,
		};
	}

	private async resolveTurnModel(turnContext: ThinkspaceTurnContext): Promise<LanguageModel> {
		let resolved: Awaited<ReturnType<typeof resolveOwnedThinkspaceTurnModel>>;

		try {
			resolved = await resolveOwnedThinkspaceTurnModel({
				db: createDb(this.env.DB),
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

		return resolved.model;
	}
}
