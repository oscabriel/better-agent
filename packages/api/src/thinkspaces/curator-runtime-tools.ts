/**
 * The Curator's propose-only toolset (#127) — the tools that let the creation
 * conversation mold a draft Agent Profile live, the heart of the refinement
 * engine. Each tool is owner-scoped to the one draft the `CuratorAgent` is bound
 * to (it resolves the draft from the runtime's stored context, never from a tool
 * argument) and writes through the same Agent-Profile-draft and tool-selection
 * seams the owner UI uses, so the Curator's proposals and the owner's edits can
 * never derive Permissions differently.
 *
 * The invariant "proposes, never grants" is structural here: there is no
 * `activate` tool and no `grant` tool to hand out. Enabling a tool only records
 * the requested Permission on the draft; the owner grants it, and activates the
 * Thinkspace, as a separate act outside this runtime (ADR-0010). Every execution
 * failure resolves to a product-safe string (never a thrown error and never a
 * fabricated success) so the bounded Curator loop keeps running.
 */
import type { ProductDb } from "@better-agent/db";
import { tool } from "ai";
import type { ToolSet } from "ai";
import { z } from "zod";

import { ModelCatalogError, validateCatalogModelId } from "../models/model-catalog";
import type { ModelCatalog } from "../models/model-catalog";
import {
	AGENT_PROFILE_INSTRUCTIONS_MAX_LENGTH,
	AGENT_PROFILE_REASONING_LEVELS,
	AgentProfileValidationError,
	deriveAgentProfileDisplayName,
	getSeedReasoningLevel,
	MCP_TOOL_ACCESS_REQUEST_RISKS,
	validateAgentProfileIdentity,
	validateAgentProfileModelBehavior,
} from "./agent-profile";
import type { DraftAgentProfileRevision, McpToolAccessRequestRisk } from "./agent-profile";
import { getDraftAgentProfileRevision, saveAgentProfileDraft } from "./agent-profile-repository";
import { isBuiltInToolId } from "./built-in-tools";
import { isConnectedAccountToolId } from "./connected-account-tools";
import {
	MAX_CONFIGURATION_SUMMARY_LENGTH,
	MAX_GOAL_LENGTH,
	ThinkspaceLifecycleValidationError,
	validateCurationConfigurationSummary,
	validateCurationGoal,
} from "./lifecycle";
import { PermissionPolicyError } from "./policy";
import { applyCurationGoal, updateCurationDraftThinkspace } from "./repository";
import {
	normalizeBuiltInToolIds,
	normalizeConnectedAccountToolIds,
	parseMcpEnablementToolId,
	toRequestedPermissions,
	toToolEnablements,
	toToolSelectionSet,
} from "./tool-selection";
import type { ThinkspaceToolSelectionSet } from "./tool-selection";

/**
 * Everything a Curator tool needs at execute time, resolved together: the draft
 * the runtime is bound to ({@link CurationForwardContext}), plus the product db
 * and model catalog built from the runtime's environment. Resolving it lazily
 * (the draft id lives in async DO storage, `getTools()` is sync) keeps the tools
 * free of the runtime substrate.
 */
export interface CuratorRuntimeToolContext {
	db: ProductDb;
	draftThinkspaceId: string;
	modelCatalog: ModelCatalog;
	ownerUserId: string;
}

export type ResolveCuratorRuntimeToolContext = () => Promise<CuratorRuntimeToolContext | null>;

export interface CreateCuratorRuntimeToolsInput {
	resolveContext: ResolveCuratorRuntimeToolContext;
}

const MISSING_CONTEXT_MESSAGE =
	"This curation conversation has lost its draft Thinkspace, so nothing was changed.";
const DRAFT_UNAVAILABLE_MESSAGE =
	"This curation draft is no longer available, so nothing was changed.";
const CATALOG_UNAVAILABLE_MESSAGE =
	"The model catalog is temporarily unavailable, so the model could not be changed. Try again shortly.";
const UNEXPECTED_FAILURE_MESSAGE =
	"That change could not be applied, so nothing was changed. Mention the limitation rather than describing it as done.";

/**
 * Validation and lookup failures become honest product-safe results, not
 * exceptions or fabricated successes. Typed domain errors already carry
 * owner-facing guidance; anything else collapses to a generic no-change message.
 */
const toProductSafeToolFailure = (error: unknown): string => {
	if (
		error instanceof ThinkspaceLifecycleValidationError ||
		error instanceof AgentProfileValidationError ||
		error instanceof PermissionPolicyError
	) {
		return error.message;
	}

	if (error instanceof ModelCatalogError) {
		return error.kind === "catalog_unavailable" ? CATALOG_UNAVAILABLE_MESSAGE : error.message;
	}

	return UNEXPECTED_FAILURE_MESSAGE;
};

type BoundDraftResult =
	| { context: CuratorRuntimeToolContext; draft: DraftAgentProfileRevision; ok: true }
	| { message: string; ok: false };

/**
 * Resolves the bound context and the draft's single revision together — the
 * common preamble for every tool that reads or writes the draft revision. A
 * missing context or absent draft fails product-safely.
 */
const loadBoundDraft = async (
	resolveContext: ResolveCuratorRuntimeToolContext,
): Promise<BoundDraftResult> => {
	const context = await resolveContext();

	if (!context) {
		return { message: MISSING_CONTEXT_MESSAGE, ok: false };
	}

	const draft = await getDraftAgentProfileRevision(context.db, {
		thinkspaceId: context.draftThinkspaceId,
	});

	if (!draft) {
		return { message: DRAFT_UNAVAILABLE_MESSAGE, ok: false };
	}

	return { context, draft, ok: true };
};

interface ToolEnablementAddition {
	alreadyEnabled: boolean;
	set: ThinkspaceToolSelectionSet;
}

/**
 * Adds one tool to a reconstructed selection set, routed by catalog: a built-in
 * id, a connected-account id, or otherwise an MCP `serverId`/`serverId:toolName`
 * reference (the `risk` argument applies only to MCP). Enabling an
 * already-enabled tool is a no-op the caller reports rather than a duplicate.
 */
const addToolToSelectionSet = (
	current: ThinkspaceToolSelectionSet,
	toolId: string,
	risk: McpToolAccessRequestRisk | undefined,
): ToolEnablementAddition => {
	if (isBuiltInToolId(toolId)) {
		if (current.builtInToolIds.includes(toolId)) {
			return { alreadyEnabled: true, set: current };
		}

		return {
			alreadyEnabled: false,
			set: { ...current, builtInToolIds: [...current.builtInToolIds, toolId] },
		};
	}

	if (isConnectedAccountToolId(toolId)) {
		if (current.connectedAccountToolIds.includes(toolId)) {
			return { alreadyEnabled: true, set: current };
		}

		return {
			alreadyEnabled: false,
			set: {
				...current,
				connectedAccountToolIds: [...current.connectedAccountToolIds, toolId],
			},
		};
	}

	const { serverId, toolName } = parseMcpEnablementToolId(toolId);
	const alreadyEnabled = current.selections.some(
		(selection) => selection.serverId === serverId && selection.toolName === toolName,
	);

	if (alreadyEnabled) {
		return { alreadyEnabled: true, set: current };
	}

	return {
		alreadyEnabled: false,
		set: {
			...current,
			selections: [...current.selections, { risk: risk ?? "unknown", serverId, toolName }],
		},
	};
};

const createSetGoalTool = (resolveContext: ResolveCuratorRuntimeToolContext) =>
	tool({
		description:
			"Set this Thinkspace's Goal — the single bounded, checkable outcome the Agent Profile is shaped around. Giving the draft a real Goal returns it to the owner's Thinkspace list. Proposes only; nothing is activated.",
		execute: async ({ goal }) => {
			const bound = await loadBoundDraft(resolveContext);

			if (!bound.ok) {
				return bound.message;
			}

			const { context, draft } = bound;

			try {
				const validatedGoal = validateCurationGoal(goal);
				// With no separate naming tool, the agent's name tracks the Goal — the
				// same Goal -> display-name seed Thinkspace creation uses — so the agent
				// card stops reading "Untitled Thinkspace" as soon as the Goal is real.
				// Validate everything before the single atomic write so a failure leaves
				// the draft untouched and the result message honest.
				const identity = validateAgentProfileIdentity({
					displayName: deriveAgentProfileDisplayName(validatedGoal),
					instructions: draft.identity.instructions,
				});
				const updatedThinkspace = await applyCurationGoal(context.db, {
					displayName: identity.displayName,
					goal: validatedGoal,
					ownerUserId: context.ownerUserId,
					revisionId: draft.id,
					thinkspaceId: context.draftThinkspaceId,
					updatedAt: new Date(),
				});

				if (!updatedThinkspace) {
					return DRAFT_UNAVAILABLE_MESSAGE;
				}

				return `Set the Goal to: ${validatedGoal}`;
			} catch (error) {
				return toProductSafeToolFailure(error);
			}
		},
		inputSchema: z.object({
			goal: z
				.string()
				.min(1)
				.max(MAX_GOAL_LENGTH)
				.describe("The single bounded, checkable outcome this Thinkspace exists to reach."),
		}),
	});

const createSetConfigurationSummaryTool = (resolveContext: ResolveCuratorRuntimeToolContext) =>
	tool({
		description:
			"Set this Thinkspace's configuration summary — a short plain-language description of how it is set up. Pass an empty string to clear it. Proposes only.",
		execute: async ({ summary }) => {
			const context = await resolveContext();

			if (!context) {
				return MISSING_CONTEXT_MESSAGE;
			}

			try {
				const validatedSummary = validateCurationConfigurationSummary(summary);
				const updatedThinkspace = await updateCurationDraftThinkspace(context.db, {
					ownerUserId: context.ownerUserId,
					patch: { configurationSummary: validatedSummary, updatedAt: new Date() },
					thinkspaceId: context.draftThinkspaceId,
				});

				if (!updatedThinkspace) {
					return DRAFT_UNAVAILABLE_MESSAGE;
				}

				return validatedSummary
					? "Updated the configuration summary."
					: "Cleared the configuration summary.";
			} catch (error) {
				return toProductSafeToolFailure(error);
			}
		},
		inputSchema: z.object({
			summary: z
				.string()
				.max(MAX_CONFIGURATION_SUMMARY_LENGTH)
				.describe("A short plain-language description of how this Thinkspace is configured."),
		}),
	});

const createSetInstructionsTool = (resolveContext: ResolveCuratorRuntimeToolContext) =>
	tool({
		description:
			"Set the Agent Profile instructions — the standing guidance the future Thinkspace Agent runs under. Proposes only.",
		execute: async ({ instructions }) => {
			const bound = await loadBoundDraft(resolveContext);

			if (!bound.ok) {
				return bound.message;
			}

			const { context, draft } = bound;

			try {
				const identity = validateAgentProfileIdentity({
					displayName: draft.identity.displayName,
					instructions,
				});
				await saveAgentProfileDraft(context.db, {
					draft: { ...draft, identity, updatedAt: new Date() },
				});

				return "Updated the Agent Profile instructions.";
			} catch (error) {
				return toProductSafeToolFailure(error);
			}
		},
		inputSchema: z.object({
			instructions: z
				.string()
				.max(AGENT_PROFILE_INSTRUCTIONS_MAX_LENGTH)
				.describe("The standing guidance the future Thinkspace Agent runs under."),
		}),
	});

const createSetModelTool = (resolveContext: ResolveCuratorRuntimeToolContext) =>
	tool({
		description:
			"Set the model the future Thinkspace Agent runs on, validated against the supported catalog. Optionally set its reasoning level. Proposes only.",
		execute: async ({ modelId, reasoningLevel }) => {
			const bound = await loadBoundDraft(resolveContext);

			if (!bound.ok) {
				return bound.message;
			}

			const { context, draft } = bound;

			try {
				const { entry } = await validateCatalogModelId(context.modelCatalog, modelId);
				const modelBehavior = validateAgentProfileModelBehavior({
					catalogEntry: entry,
					modelId: entry.id,
					reasoningLevel: getSeedReasoningLevel({
						catalogEntryReasoning: entry.reasoning,
						reasoningEffort: reasoningLevel,
					}),
				});
				// Changing the model changes its provider, so the model-provider
				// credential request must be re-derived; re-running the shared
				// derivation over the draft's existing tools keeps every other request
				// identical to what the owner UI would have written.
				const selectionSet = toToolSelectionSet(draft.toolEnablements, draft.requestedPermissions);
				await saveAgentProfileDraft(context.db, {
					draft: {
						...draft,
						modelBehavior,
						requestedPermissions: toRequestedPermissions(
							modelBehavior.modelId,
							selectionSet.builtInToolIds,
							selectionSet.connectedAccountToolIds,
							selectionSet.selections,
						),
						updatedAt: new Date(),
					},
				});

				return `Set the model to ${entry.name} (${modelBehavior.modelId}) at ${modelBehavior.reasoningLevel} reasoning.`;
			} catch (error) {
				return toProductSafeToolFailure(error);
			}
		},
		inputSchema: z.object({
			modelId: z.string().min(1).describe("A catalog model id, e.g. anthropic:claude-sonnet-4-5."),
			reasoningLevel: z
				.enum(AGENT_PROFILE_REASONING_LEVELS)
				.optional()
				.describe("Reasoning level; ignored for non-reasoning models. Defaults sensibly."),
		}),
	});

const createEnableToolTool = (resolveContext: ResolveCuratorRuntimeToolContext) =>
	tool({
		description:
			"Enable one tool for the future Thinkspace Agent and request the Permission it needs. Accepts a built-in tool id, a connected-account tool id, or an MCP server reference (serverId or serverId:toolName). This only requests the Permission; the owner grants it at activation. Proposes only.",
		execute: async ({ risk, toolId }) => {
			const bound = await loadBoundDraft(resolveContext);

			if (!bound.ok) {
				return bound.message;
			}

			const { context, draft } = bound;

			try {
				const current = toToolSelectionSet(draft.toolEnablements, draft.requestedPermissions);
				const addition = addToolToSelectionSet(current, toolId, risk);

				if (addition.alreadyEnabled) {
					return `${toolId} is already enabled for this Agent Profile.`;
				}

				const builtInToolIds = normalizeBuiltInToolIds(addition.set.builtInToolIds);
				const connectedAccountToolIds = normalizeConnectedAccountToolIds(
					addition.set.connectedAccountToolIds,
				);
				await saveAgentProfileDraft(context.db, {
					draft: {
						...draft,
						requestedPermissions: toRequestedPermissions(
							draft.modelBehavior.modelId,
							builtInToolIds,
							connectedAccountToolIds,
							addition.set.selections,
						),
						toolEnablements: toToolEnablements(
							builtInToolIds,
							connectedAccountToolIds,
							addition.set.selections,
						),
						updatedAt: new Date(),
					},
				});

				return `Enabled ${toolId} and requested the Permission it needs. You grant it when you activate the Thinkspace.`;
			} catch (error) {
				return toProductSafeToolFailure(error);
			}
		},
		inputSchema: z.object({
			risk: z
				.enum(MCP_TOOL_ACCESS_REQUEST_RISKS)
				.optional()
				.describe("For an MCP server tool, its access risk. Ignored for other tool sources."),
			toolId: z
				.string()
				.min(1)
				.describe(
					"A built-in tool id, a connected-account tool id, or an MCP serverId[:toolName].",
				),
		}),
	});

/**
 * Assembles the Curator's complete propose-only toolset. There is deliberately
 * no `activate` and no `grant` tool — "proposes, never grants" is a structural
 * property of this set, not a runtime check the Curator could forget.
 */
export const createCuratorRuntimeTools = ({
	resolveContext,
}: CreateCuratorRuntimeToolsInput): ToolSet => ({
	enable_tool: createEnableToolTool(resolveContext),
	set_configuration_summary: createSetConfigurationSummaryTool(resolveContext),
	set_goal: createSetGoalTool(resolveContext),
	set_instructions: createSetInstructionsTool(resolveContext),
	set_model: createSetModelTool(resolveContext),
});
