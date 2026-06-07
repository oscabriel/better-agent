import { ORPCError } from "@orpc/server";
import { z } from "zod";

import { protectedProcedure } from "../procedures";
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

const createThinkspaceId = (): string => `thinkspace_${crypto.randomUUID()}`;

const toBadRequest = (
	error: ThinkspaceLifecycleValidationError,
): ORPCError<"BAD_REQUEST", undefined> => new ORPCError("BAD_REQUEST", { message: error.message });

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
	list: protectedProcedure.handler(
		async ({ context }) =>
			await listThinkspaces(context.db, { ownerUserId: context.session.user.id }),
	),
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
