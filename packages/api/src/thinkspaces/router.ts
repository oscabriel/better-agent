import { ORPCError } from "@orpc/server";
import { z } from "zod";

import {
	getOwnedThinkspaceModelReadiness,
	ThinkspaceTurnModelUnavailableError,
} from "../models/readiness";
import { protectedProcedure } from "../procedures";
import { inspectOwnedThinkspaceTurn, THINKSPACE_TURN_SUBMISSION_ID_MAX_LENGTH } from "./inspect";
import {
	createToolPermissionPlaceholder,
	DEFAULT_APPROVAL_POLICY,
	serializeThinkspaceToolSelections,
} from "./policy";
import {
	createThinkspaceArchivePatch,
	createThinkspaceCreationRecord,
	ThinkspaceLifecycleValidationError,
} from "./lifecycle";
import {
	archiveThinkspace,
	createThinkspace,
	getThinkspace,
	listThinkspaces,
	updateThinkspaceConfiguration,
} from "./repository";
import {
	getOwnedThinkspaceAgentRuntimeReadiness,
	ThinkspaceRuntimeResolutionError,
} from "./runtime";
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

/**
 * Runtime resolution failures (missing/misconfigured Durable Object binding)
 * are infrastructure details. The product surface only learns that the
 * runtime is unavailable, never which binding or runtime internals failed.
 */
const RUNTIME_UNAVAILABLE_MESSAGE =
	"The Thinkspace Agent runtime is not available right now. Try again shortly.";

const toBadRequest = (
	error: ThinkspaceLifecycleValidationError,
): ORPCError<"BAD_REQUEST", undefined> => new ORPCError("BAD_REQUEST", { message: error.message });

const toRuntimeUnavailable = (): ORPCError<"INTERNAL_SERVER_ERROR", undefined> =>
	new ORPCError("INTERNAL_SERVER_ERROR", { message: RUNTIME_UNAVAILABLE_MESSAGE });

const toNotFound = (): ORPCError<"NOT_FOUND", undefined> =>
	new ORPCError("NOT_FOUND", { message: "Thinkspace was not found." });

export const thinkspacesRouter = {
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
				initialInstructions: input.initialInstructions,
				ownerUserId: context.session.user.id,
			});

			return await createThinkspace(context.db, { record });
		} catch (error) {
			if (error instanceof ThinkspaceLifecycleValidationError) {
				throw toBadRequest(error);
			}

			throw error;
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

		return thinkspace;
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

			const updated = await updateThinkspaceConfiguration(context.db, {
				ownerUserId: context.session.user.id,
				patch: {
					approvalDefaults: JSON.stringify(DEFAULT_APPROVAL_POLICY),
					enabledToolIds: serializeThinkspaceToolSelections(input.selections),
					requestedPermissions: JSON.stringify(
						input.selections.map((selection) => createToolPermissionPlaceholder(selection)),
					),
					updatedAt: new Date(),
				},
				thinkspaceId: input.thinkspaceId,
			});

			if (!updated) {
				throw toNotFound();
			}

			return updated;
		}),
};
