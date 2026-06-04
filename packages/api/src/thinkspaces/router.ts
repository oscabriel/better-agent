import { ORPCError } from "@orpc/server";
import { z } from "zod";

import { protectedProcedure } from "../procedures";
import {
	createThinkspaceArchivePatch,
	createThinkspaceCreationRecord,
	ThinkspaceLifecycleValidationError,
} from "./lifecycle";
import { archiveThinkspace, createThinkspace, getThinkspace, listThinkspaces } from "./repository";

const createThinkspaceInput = z.object({
	configurationSummary: z.string().optional(),
	goal: z.string(),
	initialInstructions: z.string().optional(),
});

const thinkspaceIdInput = z.object({
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
};
