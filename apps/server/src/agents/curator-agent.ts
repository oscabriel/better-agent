import type { LanguageModelV3 } from "@ai-sdk/provider";
import {
	CURATION_CONTEXT_STORAGE_KEY,
	CURATION_FORWARD_CONTEXT_HEADER,
	decodeCurationForwardContext,
	matchesCurationForwardContext,
} from "@better-agent/api/curator/forward-context";
import type { CurationForwardContext } from "@better-agent/api/curator/forward-context";
import { CURATOR_RUNTIME_MAX_STEPS } from "@better-agent/api/curator/runtime";
import { CURATOR_SYSTEM_PROMPT } from "@better-agent/api/curator/system-prompt";
import {
	CuratorModelUnavailableError,
	getUserCuratorModelSettings,
	resolveCuratorModel,
} from "@better-agent/api/models/curator";
import { createDb } from "@better-agent/db";
import type { ProductDb } from "@better-agent/db";
import type { CloudflareEnv } from "@better-agent/env/types";
import { Think } from "@cloudflare/think";
import type { LanguageModel, ToolSet } from "ai";

/**
 * Placeholder returned by getModel(). Never used for inference: beforeTurn
 * always resolves the ungated Curator model from the user's product credential
 * and overrides it, or fails the turn with a product-safe error first.
 */
const UNRESOLVED_CURATOR_MODEL = "better-agent:curator-model-resolved-in-before-turn";

const MISSING_CURATION_CONTEXT_MESSAGE =
	"This curation conversation is missing its draft Thinkspace context.";
const CURATOR_MODEL_UNAVAILABLE_MESSAGE = "The Curator could not resolve a model to run on.";

/**
 * The Curator's creation runtime — a deliberate parallel of {@link ThinkspaceAgent},
 * for a different role (ADR-0010). Keyed on the **draft Thinkspace id** (one
 * Curator per draft), it reuses Project Think's durable session, streaming, and
 * recovery wholesale. This is the skeleton (#125): it runs and streams on the
 * ungated Curator model and carries the Curator system prompt, but assembles
 * **no mutation tools** — the propose-only `set_*`/`enable_tool` toolset lands in
 * #127. "Proposes, never grants" is therefore already structural here: there is
 * nothing for it to grant or activate with.
 */
export class CuratorAgent extends Think<CloudflareEnv> {
	private readonly curatorSystemPrompt = CURATOR_SYSTEM_PROMPT;
	private readonly curatorToolSet: ToolSet = {};
	private readonly turnModelPlaceholder: LanguageModel = UNRESOLVED_CURATOR_MODEL;

	override maxSteps = CURATOR_RUNTIME_MAX_STEPS;
	override workspaceBash = false;

	/**
	 * Fail-closed by default, mirroring the Thinkspace Agent. Project Think serves
	 * some unauthenticated routes once a request reaches the Durable Object, so
	 * this override admits exactly one thing: a curation request the worker has
	 * already authenticated and stamped with a forward context matching this
	 * runtime's bound (owner, draft Thinkspace). Everything else — direct hits,
	 * absent or mismatched context — stays 404, with no signal about whether the
	 * draft exists.
	 */
	override async fetch(request: Request): Promise<Response> {
		const forwardContext = decodeCurationForwardContext(
			request.headers.get(CURATION_FORWARD_CONTEXT_HEADER),
		);

		if (!forwardContext) {
			return CuratorAgent.runtimeClosedResponse();
		}

		const existingContext = await this.ctx.storage.get<CurationForwardContext>(
			CURATION_CONTEXT_STORAGE_KEY,
		);

		if (existingContext && !matchesCurationForwardContext(forwardContext, existingContext)) {
			return CuratorAgent.runtimeClosedResponse();
		}

		await this.ctx.storage.put<CurationForwardContext>(CURATION_CONTEXT_STORAGE_KEY, {
			draftThinkspaceId: forwardContext.draftThinkspaceId,
			ownerUserId: forwardContext.ownerUserId,
		});

		return super.fetch(request);
	}

	private static runtimeClosedResponse(): Response {
		return new Response("This Curator runtime is not directly accessible.", {
			status: 404,
		});
	}

	override getModel(): LanguageModel {
		return this.turnModelPlaceholder;
	}

	override getSystemPrompt(): string {
		return this.curatorSystemPrompt;
	}

	override getTools(): ToolSet {
		return this.curatorToolSet;
	}

	override async beforeTurn() {
		const context = await this.ctx.storage.get<CurationForwardContext>(
			CURATION_CONTEXT_STORAGE_KEY,
		);

		if (!context) {
			throw new Error(MISSING_CURATION_CONTEXT_MESSAGE);
		}

		const db = createDb(this.env.DB);
		const model = await this.resolveCuratorTurnModel(db, context);

		return { model };
	}

	/**
	 * Resolves the ungated Curator model (#124) from the user's own product
	 * credential. On any failure — no credential, an unresolvable model — the turn
	 * fails with the already product-safe connect-first message rather than a raw
	 * error.
	 */
	private async resolveCuratorTurnModel(
		db: ProductDb,
		context: CurationForwardContext,
	): Promise<LanguageModelV3> {
		try {
			const settings = await getUserCuratorModelSettings(db, context.ownerUserId);
			const resolved = await resolveCuratorModel({
				db,
				env: this.env,
				settings,
				userId: context.ownerUserId,
			});

			return resolved.model;
		} catch (error) {
			const message =
				error instanceof CuratorModelUnavailableError
					? error.message
					: CURATOR_MODEL_UNAVAILABLE_MESSAGE;
			throw new Error(message, { cause: error });
		}
	}
}
