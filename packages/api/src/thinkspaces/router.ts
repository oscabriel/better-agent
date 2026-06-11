import type { ProductDb } from "@better-agent/db";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import { DEFAULT_MODEL_ID } from "../models/catalog";
import { ModelCatalogError, validateCatalogModelId } from "../models/model-catalog";
import {
	getOwnedThinkspaceModelReadiness,
	getUserProductModelSettings,
	ThinkspaceTurnModelUnavailableError,
} from "../models/readiness";
import { protectedProcedure } from "../procedures";
import {
	AgentProfileValidationError,
	AGENT_PROFILE_DISPLAY_NAME_MAX_LENGTH,
	isAgentProfileReasoningLevel,
	validateAgentProfileIdentity,
	validateAgentProfileModelBehavior,
} from "./agent-profile";
import type {
	ActiveAgentProfileRevision,
	RequestedPermission,
	ToolEnablement,
} from "./agent-profile";
import {
	AgentProfileLifecycleError,
	createAgentProfileActivation,
	createAgentProfileDraftFromActive,
	createInitialAgentProfileDraft,
} from "./agent-profile-lifecycle";
import {
	applyAgentProfileActivation,
	getActiveAgentProfileRevision,
	getDraftAgentProfileRevision,
	saveAgentProfileDraft,
} from "./agent-profile-repository";
import { inspectOwnedThinkspaceTurn, THINKSPACE_TURN_SUBMISSION_ID_MAX_LENGTH } from "./inspect";
import {
	listThinkspacePermissions,
	prepareThinkspacePermissionGrants,
	revokeThinkspacePermission,
	saveThinkspacePermissionGrants,
	ThinkspacePermissionGrantError,
} from "./permissions";
import { createMcpToolAccessPermissionRequest, serializeThinkspaceToolSelections } from "./policy";
import {
	createThinkspaceArchivePatch,
	createThinkspaceCreationRecord,
	ThinkspaceLifecycleValidationError,
} from "./lifecycle";
import {
	archiveThinkspace,
	createThinkspaceWithAgentProfileDraft,
	getThinkspace,
	listThinkspaces,
} from "./repository";
import {
	getOwnedThinkspaceAgentRuntimeReadiness,
	ThinkspaceRuntimeResolutionError,
} from "./runtime";
import { createPermissionStorePolicy } from "./permission-policy";
import type { ToolPotency } from "./permission-policy";
import { getOwnedThinkspaceRuntimePolicy } from "./runtime-policy";
import {
	submitOwnedThinkspaceTurn,
	THINKSPACE_TURN_IDEMPOTENCY_KEY_MAX_LENGTH,
	THINKSPACE_TURN_INSTRUCTION_MAX_LENGTH,
	ThinkspaceTurnValidationError,
} from "./turns";

const createThinkspaceInput = z.object({
	configurationSummary: z.string().optional(),
	goal: z.string(),
	initialInstructions: z.string().optional(),
});

const thinkspaceIdInput = z.object({
	thinkspaceId: z.string().min(1),
});

const revokePermissionInput = thinkspaceIdInput.extend({
	permissionId: z.string().min(1),
});

const activateAgentProfileInput = thinkspaceIdInput.extend({
	grantedPermissionIndexes: z.array(z.number().int().nonnegative()).optional(),
});

const toolSelectionSchema = z.object({
	risk: z.enum(["read_only", "mutating", "unknown"]),
	serverId: z.string().trim().min(1),
	toolName: z.string().trim().min(1).optional(),
});

const updateToolSelectionsInput = z.object({
	selections: z.array(toolSelectionSchema),
	thinkspaceId: z.string().min(1),
});

const inspectTurnInput = z.object({
	submissionId: z.string().min(1).max(THINKSPACE_TURN_SUBMISSION_ID_MAX_LENGTH),
	thinkspaceId: z.string().min(1),
});

const submitTurnInput = z.object({
	idempotencyKey: z.string().min(1).max(THINKSPACE_TURN_IDEMPOTENCY_KEY_MAX_LENGTH),
	instruction: z.string().min(1).max(THINKSPACE_TURN_INSTRUCTION_MAX_LENGTH),
	thinkspaceId: z.string().min(1),
});

const createThinkspaceId = (): string => `thinkspace_${crypto.randomUUID()}`;
const createAgentProfileRevisionId = (): string => `agent_profile_revision_${crypto.randomUUID()}`;

const toToolEnablements = (selections: z.infer<typeof toolSelectionSchema>[]): ToolEnablement[] => {
	const normalized = JSON.parse(serializeThinkspaceToolSelections(selections)) as z.infer<
		typeof toolSelectionSchema
	>[];

	return normalized.map((selection) => ({
		source: "mcp_server",
		toolId: selection.toolName ? `${selection.serverId}:${selection.toolName}` : selection.serverId,
	}));
};

const toRequestedPermissions = (
	selections: z.infer<typeof toolSelectionSchema>[],
): RequestedPermission[] =>
	selections.map((selection) => createMcpToolAccessPermissionRequest(selection));

export interface EnabledToolPotencyInspection {
	potency: ToolPotency;
	source: ToolEnablement["source"];
	toolId: string;
}

/**
 * Inspect projection only: potency itself comes from the same Permission
 * policy seam that turn assembly and runtime enforcement use.
 */
const inspectEnabledToolPotencies = async (
	db: ProductDb,
	revision: ActiveAgentProfileRevision,
): Promise<EnabledToolPotencyInspection[]> => {
	const verdicts = await createPermissionStorePolicy({ db }).evaluateToolPotency({
		enablements: revision.toolEnablements,
		thinkspaceId: revision.thinkspaceId,
	});
	const potencyByToolId = new Map(
		verdicts.map((verdict) => [verdict.toolId, verdict.potency] as const),
	);

	return revision.toolEnablements.map((enablement) => ({
		potency: potencyByToolId.get(enablement.toolId) ?? "inert",
		source: enablement.source,
		toolId: enablement.toolId,
	}));
};

const deriveAgentProfileDisplayName = (goal: string): string => {
	const normalized = goal.trim();

	if (normalized.length <= AGENT_PROFILE_DISPLAY_NAME_MAX_LENGTH) {
		return normalized;
	}

	return `${normalized.slice(0, AGENT_PROFILE_DISPLAY_NAME_MAX_LENGTH - 1).trimEnd()}…`;
};

const getSeedReasoningLevel = (input: {
	catalogEntryReasoning: string;
	reasoningEffort: string | null | undefined;
}) => {
	if (input.catalogEntryReasoning === "none") {
		return "none";
	}

	return isAgentProfileReasoningLevel(input.reasoningEffort) && input.reasoningEffort !== "none"
		? input.reasoningEffort
		: "medium";
};

/**
 * Runtime resolution failures (missing/misconfigured Durable Object binding)
 * are infrastructure details. The product surface only learns that the
 * runtime is unavailable, never which binding or runtime internals failed.
 */
const RUNTIME_UNAVAILABLE_MESSAGE =
	"The Thinkspace Agent runtime is not available right now. Try again shortly.";

const toBadRequest = (error: Error): ORPCError<"BAD_REQUEST", undefined> =>
	new ORPCError("BAD_REQUEST", { message: error.message });

const toCatalogUnavailable = (): ORPCError<"INTERNAL_SERVER_ERROR", undefined> =>
	new ORPCError("INTERNAL_SERVER_ERROR", {
		message:
			"The model catalog is temporarily unavailable, so the Agent Profile draft could not be validated. Try again shortly.",
	});

const toRuntimeUnavailable = (): ORPCError<"INTERNAL_SERVER_ERROR", undefined> =>
	new ORPCError("INTERNAL_SERVER_ERROR", { message: RUNTIME_UNAVAILABLE_MESSAGE });

const toNotFound = (): ORPCError<"NOT_FOUND", undefined> =>
	new ORPCError("NOT_FOUND", { message: "Thinkspace was not found." });

const throwProductSafeProfileError = (error: unknown): never => {
	if (
		error instanceof ThinkspaceLifecycleValidationError ||
		error instanceof AgentProfileLifecycleError ||
		error instanceof AgentProfileValidationError ||
		error instanceof ThinkspacePermissionGrantError
	) {
		throw toBadRequest(error);
	}

	if (error instanceof ModelCatalogError) {
		if (error.kind === "catalog_unavailable") {
			throw toCatalogUnavailable();
		}

		throw toBadRequest(error);
	}

	throw error;
};

export const thinkspacesRouter = {
	activateAgentProfile: protectedProcedure
		.input(activateAgentProfileInput)
		.handler(async ({ context, input }) => {
			const thinkspace = await getThinkspace(context.db, {
				ownerUserId: context.session.user.id,
				thinkspaceId: input.thinkspaceId,
			});

			if (!thinkspace) {
				throw toNotFound();
			}

			if (thinkspace.status === "archived") {
				throw new ORPCError("BAD_REQUEST", {
					message: "Archived Thinkspaces cannot activate Agent Profile revisions.",
				});
			}

			try {
				const draft = await getDraftAgentProfileRevision(context.db, {
					thinkspaceId: thinkspace.id,
				});

				if (!draft) {
					throw new AgentProfileLifecycleError(
						"No draft Agent Profile revision is ready to activate.",
					);
				}

				const activation = createAgentProfileActivation({
					currentActive: await getActiveAgentProfileRevision(context.db, {
						thinkspaceId: thinkspace.id,
					}),
					draft,
					thinkspace,
				});
				const grantIndexes =
					input.grantedPermissionIndexes ?? draft.requestedPermissions.map((_, index) => index);
				const requestedGrants: RequestedPermission[] = [];
				for (const index of grantIndexes) {
					const permission = draft.requestedPermissions[index];
					if (permission) {
						requestedGrants.push(permission);
					}
				}

				const grantInputs = requestedGrants.map((permission) => ({
					grantedByUserId: context.session.user.id,
					permission,
					thinkspaceId: thinkspace.id,
				}));
				const permissionGrants = prepareThinkspacePermissionGrants(grantInputs);

				await applyAgentProfileActivation(context.db, { activation });
				const grantedPermissions = await saveThinkspacePermissionGrants(
					context.db,
					permissionGrants,
				);

				return {
					activatedRevision: activation.activatedRevision,
					grantedPermissions,
					thinkspaceId: thinkspace.id,
					thinkspaceStatus: activation.thinkspaceActivationPatch?.status ?? thinkspace.status,
				};
			} catch (error) {
				throwProductSafeProfileError(error);
			}
		}),
	archive: protectedProcedure.input(thinkspaceIdInput).handler(async ({ context, input }) => {
		const thinkspace = await getThinkspace(context.db, {
			ownerUserId: context.session.user.id,
			thinkspaceId: input.thinkspaceId,
		});

		if (!thinkspace) {
			throw toNotFound();
		}

		try {
			const archived = await archiveThinkspace(context.db, {
				ownerUserId: context.session.user.id,
				patch: createThinkspaceArchivePatch(thinkspace.status),
				thinkspaceId: input.thinkspaceId,
			});

			if (!archived) {
				throw toNotFound();
			}

			return archived;
		} catch (error) {
			if (error instanceof ThinkspaceLifecycleValidationError) {
				throw toBadRequest(error);
			}

			throw error;
		}
	}),
	create: protectedProcedure.input(createThinkspaceInput).handler(async ({ context, input }) => {
		try {
			const record = createThinkspaceCreationRecord({
				configurationSummary: input.configurationSummary,
				goal: input.goal,
				id: createThinkspaceId(),
				ownerUserId: context.session.user.id,
			});
			const identity = validateAgentProfileIdentity({
				displayName: deriveAgentProfileDisplayName(record.goal),
				instructions: input.initialInstructions ?? "",
			});
			const settings = await getUserProductModelSettings(context.db, context.session.user.id);
			const requestedModelId = settings?.defaultModel?.trim() || DEFAULT_MODEL_ID;
			const { entry } = await validateCatalogModelId(context.modelCatalog, requestedModelId);
			const modelBehavior = validateAgentProfileModelBehavior({
				catalogEntry: entry,
				modelId: requestedModelId,
				reasoningLevel: getSeedReasoningLevel({
					catalogEntryReasoning: entry.reasoning,
					reasoningEffort: settings?.reasoningEffort,
				}),
			});
			const draft = createInitialAgentProfileDraft({
				id: createAgentProfileRevisionId(),
				identity,
				modelBehavior,
				thinkspaceId: record.id,
			});
			const created = await createThinkspaceWithAgentProfileDraft(context.db, { draft, record });

			return { ...created.thinkspace, agentProfileRevision: created.draft };
		} catch (error) {
			throwProductSafeProfileError(error);
		}
	}),
	get: protectedProcedure.input(thinkspaceIdInput).handler(async ({ context, input }) => {
		const thinkspace = await getThinkspace(context.db, {
			ownerUserId: context.session.user.id,
			thinkspaceId: input.thinkspaceId,
		});

		if (!thinkspace) {
			throw toNotFound();
		}

		const activeRevision = await getActiveAgentProfileRevision(context.db, {
			thinkspaceId: thinkspace.id,
		});
		const agentProfileRevision =
			activeRevision ??
			(await getDraftAgentProfileRevision(context.db, {
				thinkspaceId: thinkspace.id,
			}));

		return {
			...thinkspace,
			agentProfileRevision,
			enabledToolPotencies: activeRevision
				? await inspectEnabledToolPotencies(context.db, activeRevision)
				: [],
			grantedPermissions: await listThinkspacePermissions(context.db, {
				thinkspaceId: thinkspace.id,
			}),
		};
	}),
	inspectTurn: protectedProcedure.input(inspectTurnInput).handler(async ({ context, input }) => {
		try {
			const inspection = await inspectOwnedThinkspaceTurn({
				db: context.db,
				env: context.env,
				ownerUserId: context.session.user.id,
				submissionId: input.submissionId,
				thinkspaceId: input.thinkspaceId,
			});

			if (!inspection) {
				throw toNotFound();
			}

			return inspection;
		} catch (error) {
			if (error instanceof ThinkspaceTurnValidationError) {
				throw new ORPCError("BAD_REQUEST", { message: error.message });
			}

			if (error instanceof ThinkspaceRuntimeResolutionError) {
				throw toRuntimeUnavailable();
			}

			throw error;
		}
	}),
	list: protectedProcedure.handler(
		async ({ context }) =>
			await listThinkspaces(context.db, { ownerUserId: context.session.user.id }),
	),
	modelReadiness: protectedProcedure
		.input(thinkspaceIdInput)
		.handler(async ({ context, input }) => {
			const readiness = await getOwnedThinkspaceModelReadiness({
				db: context.db,
				env: context.env,
				modelCatalog: context.modelCatalog,
				ownerUserId: context.session.user.id,
				thinkspaceId: input.thinkspaceId,
			});

			if (!readiness) {
				throw toNotFound();
			}

			return readiness;
		}),
	revokePermission: protectedProcedure
		.input(revokePermissionInput)
		.handler(async ({ context, input }) => {
			const thinkspace = await getThinkspace(context.db, {
				ownerUserId: context.session.user.id,
				thinkspaceId: input.thinkspaceId,
			});

			if (!thinkspace) {
				throw toNotFound();
			}

			const revokedPermission = await revokeThinkspacePermission(context.db, {
				permissionId: input.permissionId,
				thinkspaceId: thinkspace.id,
			});

			if (!revokedPermission) {
				throw toNotFound();
			}

			return {
				revokedPermissionId: revokedPermission.id,
				thinkspaceId: thinkspace.id,
			};
		}),
	runtimePolicy: protectedProcedure.input(thinkspaceIdInput).handler(async ({ context, input }) => {
		const policy = await getOwnedThinkspaceRuntimePolicy({
			db: context.db,
			ownerUserId: context.session.user.id,
			thinkspaceId: input.thinkspaceId,
		});

		if (!policy) {
			throw toNotFound();
		}

		return policy;
	}),
	runtimeReadiness: protectedProcedure
		.input(thinkspaceIdInput)
		.handler(async ({ context, input }) => {
			try {
				const readiness = await getOwnedThinkspaceAgentRuntimeReadiness({
					db: context.db,
					env: context.env,
					ownerUserId: context.session.user.id,
					thinkspaceId: input.thinkspaceId,
				});

				if (!readiness) {
					throw toNotFound();
				}

				return readiness;
			} catch (error) {
				if (error instanceof ThinkspaceRuntimeResolutionError) {
					throw toRuntimeUnavailable();
				}

				throw error;
			}
		}),
	submitTurn: protectedProcedure.input(submitTurnInput).handler(async ({ context, input }) => {
		try {
			const acceptance = await submitOwnedThinkspaceTurn({
				db: context.db,
				env: context.env,
				idempotencyKey: input.idempotencyKey,
				instruction: input.instruction,
				modelCatalog: context.modelCatalog,
				ownerUserId: context.session.user.id,
				thinkspaceId: input.thinkspaceId,
			});

			if (!acceptance) {
				throw toNotFound();
			}

			return acceptance;
		} catch (error) {
			if (error instanceof ThinkspaceTurnValidationError) {
				throw new ORPCError("BAD_REQUEST", { message: error.message });
			}

			if (error instanceof ThinkspaceTurnModelUnavailableError) {
				throw new ORPCError("BAD_REQUEST", { message: error.message });
			}

			if (error instanceof ThinkspaceRuntimeResolutionError) {
				throw toRuntimeUnavailable();
			}

			throw error;
		}
	}),
	updateToolSelections: protectedProcedure
		.input(updateToolSelectionsInput)
		.handler(async ({ context, input }) => {
			const thinkspace = await getThinkspace(context.db, {
				ownerUserId: context.session.user.id,
				thinkspaceId: input.thinkspaceId,
			});

			if (!thinkspace) {
				throw toNotFound();
			}

			if (thinkspace.status === "archived") {
				throw new ORPCError("BAD_REQUEST", {
					message: "Archived Thinkspaces cannot change tool enablement.",
				});
			}

			try {
				const currentDraft = await getDraftAgentProfileRevision(context.db, {
					thinkspaceId: thinkspace.id,
				});
				const activeRevision = await getActiveAgentProfileRevision(context.db, {
					thinkspaceId: thinkspace.id,
				});
				const draft =
					currentDraft ??
					(activeRevision
						? createAgentProfileDraftFromActive({
								active: activeRevision,
								id: createAgentProfileRevisionId(),
							})
						: null);

				if (!draft) {
					throw new AgentProfileLifecycleError(
						"No Agent Profile revision is available for tool enablement.",
					);
				}

				const updatedDraft = await saveAgentProfileDraft(context.db, {
					draft: {
						...draft,
						requestedPermissions: toRequestedPermissions(input.selections),
						toolEnablements: toToolEnablements(input.selections),
						updatedAt: new Date(),
					},
				});

				return {
					agentProfileRevision: updatedDraft,
					thinkspaceId: thinkspace.id,
				};
			} catch (error) {
				throwProductSafeProfileError(error);
			}
		}),
};
