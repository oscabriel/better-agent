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

/**
 * A grounding clause appended to every turn's system prompt. The agent acts
 * only through the tools assembled for the turn (enabled ∩ potent), so when a
 * capability is off no tool is present — and a weaker model will otherwise
 * narrate a plausible success it never performed (e.g. "Memory recorded"). This
 * forbids that: the agent must not report an action it has no tool for, and a
 * durable Memory exists only once the held `memory_write` tool runs on an
 * owner-approved continuation.
 */
export const THINKSPACE_AGENT_GROUNDING_CLAUSE =
	"You act only through the tools made available to you on this turn. Never claim to have recorded a Memory, read a Source, searched the web, or taken any other action unless you actually called the tool for it on this turn. Recording a durable Memory happens only by calling the memory_write tool, which is held for the owner's Approval; if that tool is not available to you, you cannot record Memories — say so plainly instead of describing it as done.";

export const buildThinkspaceAgentSystemPrompt = (revision: ActiveAgentProfileRevision): string => {
	const header = `You are ${revision.identity.displayName}, a Thinkspace Agent for Better Agent.`;
	const sections = revision.identity.instructions
		? [header, revision.identity.instructions, THINKSPACE_AGENT_GROUNDING_CLAUSE]
		: [header, THINKSPACE_AGENT_GROUNDING_CLAUSE];

	return sections.join("\n\n");
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
