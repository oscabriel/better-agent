/**
 * The beforeTurn assembly contract.
 *
 * The runtime adapter (ThinkspaceAgent's beforeTurn, ADR-0006) assembles
 * each turn from the *active* Agent Profile revision: system prompt from
 * identity, model selection from model behavior, active tools from
 * enablements filtered through the Thinkspace's Permission policy. The
 * assembly carries the revision id/version so every turn stays attributable
 * to the exact revision it ran under (ADR-0007).
 *
 * This module is pure: credential resolution, provider construction, and
 * reasoning-level-to-provider-option translation stay in models/resolver
 * and the runtime adapter.
 */
import { THINKSPACE_RUNTIME_MAX_STEPS } from "./runtime-policy";
import type { ActiveAgentProfileRevision, AgentProfileReasoningLevel } from "./agent-profile";
import type { CatalogModelId } from "../models/model-catalog";
import type { ToolPotencyVerdict } from "./permission-policy";

export interface ThinkspaceTurnModelSelection {
	modelId: CatalogModelId;
	reasoningLevel: AgentProfileReasoningLevel;
}

export interface ThinkspaceTurnAssembly {
	/** Enabled tools judged potent by the Permission policy. */
	activeTools: string[];
	maxSteps: number;
	modelSelection: ThinkspaceTurnModelSelection;
	/** Turn-to-revision attribution (ADR-0007). */
	profileRevisionId: string;
	profileVersion: number;
	systemPrompt: string;
}

export interface AssembleThinkspaceTurnInput {
	maxSteps?: number;
	revision: ActiveAgentProfileRevision;
	toolPotencies: ToolPotencyVerdict[];
}

export const buildThinkspaceAgentSystemPrompt = (revision: ActiveAgentProfileRevision): string => {
	const header = `You are ${revision.identity.displayName}, a Thinkspace Agent for Better Agent.`;

	return revision.identity.instructions ? `${header}\n\n${revision.identity.instructions}` : header;
};

/**
 * Pure assembly: only enabled tools with a potent verdict become active.
 * Enabled tools without a verdict stay inert (conservative default), and
 * verdicts for tools the revision does not enable are ignored — potency can
 * never add a tool the Profile did not make present.
 */
export const assembleThinkspaceTurn = ({
	maxSteps = THINKSPACE_RUNTIME_MAX_STEPS,
	revision,
	toolPotencies,
}: AssembleThinkspaceTurnInput): ThinkspaceTurnAssembly => {
	const potentToolIds = new Set(
		toolPotencies
			.filter((verdict) => verdict.potency === "potent")
			.map((verdict) => verdict.toolId),
	);

	return {
		activeTools: revision.toolEnablements
			.filter((enablement) => potentToolIds.has(enablement.toolId))
			.map((enablement) => enablement.toolId),
		maxSteps,
		modelSelection: {
			modelId: revision.modelBehavior.modelId,
			reasoningLevel: revision.modelBehavior.reasoningLevel,
		},
		profileRevisionId: revision.id,
		profileVersion: revision.version,
		systemPrompt: buildThinkspaceAgentSystemPrompt(revision),
	};
};
