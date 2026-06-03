import { ORPCError } from "@orpc/server";
import { z } from "zod";

import { protectedProcedure } from "../procedures";
import { createThinkspaceCreationRecord, ThinkspaceLifecycleValidationError } from "./lifecycle";
import { createThinkspace, listThinkspaces } from "./repository";

const createThinkspaceInput = z.object({
	configurationSummary: z.string().optional(),
	goal: z.string(),
	initialInstructions: z.string().optional(),
});

const createThinkspaceId = (): string => `thinkspace_${crypto.randomUUID()}`;

const toBadRequest = (
	error: ThinkspaceLifecycleValidationError,
): ORPCError<"BAD_REQUEST", undefined> => new ORPCError("BAD_REQUEST", { message: error.message });

export const thinkspacesRouter = {
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
	list: protectedProcedure.handler(
		async ({ context }) =>
			await listThinkspaces(context.db, { ownerUserId: context.session.user.id }),
	),
};
