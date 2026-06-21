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
import { listConnectedAccounts } from "@better-agent/api/connected-accounts/repository";
import { DEFAULT_MODEL_ID } from "@better-agent/api/models/catalog";
import { createProductModelCatalog } from "@better-agent/api/models/models-dev";
import {
	CuratorModelUnavailableError,
	getUserCuratorModelSettings,
	resolveCuratorModel,
} from "@better-agent/api/models/curator";
import { getUserProductModelSettings } from "@better-agent/api/models/readiness";
import { getDraftAgentProfileRevision } from "@better-agent/api/thinkspaces/agent-profile-repository";
import { buildCuratorCardProjection } from "@better-agent/api/thinkspaces/curator-card";
import type { CuratorCardProjection } from "@better-agent/api/thinkspaces/curator-card";
import { createCuratorRuntimeTools } from "@better-agent/api/thinkspaces/curator-runtime-tools";
import type { CuratorRuntimeToolContext } from "@better-agent/api/thinkspaces/curator-runtime-tools";
import { getThinkspace } from "@better-agent/api/thinkspaces/repository";
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
 * recovery wholesale. It runs and streams on the ungated Curator model, carries
 * the Curator system prompt, and assembles the propose-only `set_*`/`enable_tool`
 * toolset (#127) that molds the bound draft Agent Profile. "Proposes, never
 * grants" is structural: the toolset has no activate and no grant tool, so
 * granting Permissions and activating the Thinkspace stay user-only acts.
 */
export class CuratorAgent extends Think<CloudflareEnv, CuratorCardProjection | null> {
	private readonly curatorSystemPrompt = CURATOR_SYSTEM_PROMPT;
	private readonly curatorToolSet: ToolSet = createCuratorRuntimeTools({
		resolveContext: () => this.resolveCuratorToolContext(),
	});
	private readonly turnModelPlaceholder: LanguageModel = UNRESOLVED_CURATOR_MODEL;

	/**
	 * The live agent card is a Think synced-state projection (`setState` ->
	 * `onStateUpdate`), refreshed after each propose-only tool writes the draft.
	 * It starts null: a freshly minted draft has no card yet, so the web client
	 * seeds the initial view from its draft query and applies this projection as a
	 * live delta once the first tool runs. **D1 stays the source of truth; this
	 * state is only a projection of it.**
	 */
	override initialState: CuratorCardProjection | null = null;

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

	/**
	 * Resolves what the propose-only tools need at execute time: the (owner,
	 * draft) the runtime is bound to, plus a product db and model catalog built
	 * from this runtime's environment. Mirrors how `beforeTurn` reads the bound
	 * context and builds the db. Returns null when the context is absent, so a
	 * tool that somehow runs before admission fails product-safely rather than
	 * touching another owner's data.
	 */
	private async resolveCuratorToolContext(): Promise<CuratorRuntimeToolContext | null> {
		const context = await this.ctx.storage.get<CurationForwardContext>(
			CURATION_CONTEXT_STORAGE_KEY,
		);

		if (!context) {
			return null;
		}

		return {
			db: createDb(this.env.DB),
			draftThinkspaceId: context.draftThinkspaceId,
			modelCatalog: createProductModelCatalog(this.env),
			ownerUserId: context.ownerUserId,
		};
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
	 * Every Curator tool is a propose-only write to the bound draft (#127), so the
	 * card is re-projected after each one. Reads the draft back from D1 (the source
	 * of truth) and broadcasts the derived projection to connected clients via
	 * `setState`. Observation-only and best-effort: a projection failure must not
	 * fail the turn the tool already completed, so it is swallowed and the card
	 * simply refreshes on the next write.
	 */
	override async afterToolCall(): Promise<void> {
		try {
			await this.projectCard();
		} catch {
			// Intentionally ignored: the card is a derived view, not the turn's work.
		}
	}

	/**
	 * Reads the bound draft from D1 and pushes the {@link buildCuratorCardProjection}
	 * view into synced state. Pure projection lives in `packages/api` (Think-free);
	 * the DO only resolves the inputs and calls `setState`. A missing context or an
	 * absent draft leaves the card untouched.
	 */
	private async projectCard(): Promise<void> {
		const context = await this.ctx.storage.get<CurationForwardContext>(
			CURATION_CONTEXT_STORAGE_KEY,
		);

		if (!context) {
			return;
		}

		const db = createDb(this.env.DB);
		const [thinkspace, draft, connectedAccounts, settings] = await Promise.all([
			getThinkspace(db, {
				ownerUserId: context.ownerUserId,
				thinkspaceId: context.draftThinkspaceId,
			}),
			getDraftAgentProfileRevision(db, { thinkspaceId: context.draftThinkspaceId }),
			listConnectedAccounts(db, context.ownerUserId),
			getUserProductModelSettings(db, context.ownerUserId),
		]);

		if (!(thinkspace && draft)) {
			return;
		}

		this.setState(
			buildCuratorCardProjection({
				connectedAccounts,
				defaultModelId: settings?.defaultModel?.trim() || DEFAULT_MODEL_ID,
				draft,
				thinkspace,
			}),
		);
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
