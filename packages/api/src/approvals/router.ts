import { ORPCError } from "@orpc/server";
import { z } from "zod";

import { protectedProcedure } from "../procedures";
import {
	decideOwnedThinkspaceMemoryApproval,
	ThinkspaceApprovalValidationError,
} from "../thinkspaces/approval-decisions";

export const THINKSPACE_APPROVAL_DECISION_REASON_MAX_LENGTH = 1000;

const decideInput = z.object({
	approvalId: z.string().min(1),
	decision: z.enum(["approved", "rejected"]),
	reason: z.string().max(THINKSPACE_APPROVAL_DECISION_REASON_MAX_LENGTH).optional(),
	thinkspaceId: z.string().min(1),
});

const toNotFound = (): ORPCError<"NOT_FOUND", undefined> =>
	new ORPCError("NOT_FOUND", { message: "Approval was not found." });

/**
 * The Review Queue is the cross-Thinkspace control-plane surface for pending
 * Approvals: it reads the D1 index, and deciding drives the Durable Object that
 * owns the parked turn. This slice exposes only the decide half (the batched
 * list arrives with the Review Queue page); the listing of pending Approvals
 * across all of a user's Thinkspaces follows the same owner-indexed pattern.
 */
export const approvalsRouter = {
	decide: protectedProcedure.input(decideInput).handler(async ({ context, input }) => {
		let result: Awaited<ReturnType<typeof decideOwnedThinkspaceMemoryApproval>>;

		try {
			result = await decideOwnedThinkspaceMemoryApproval({
				approvalId: input.approvalId,
				db: context.db,
				decision: input.decision,
				env: context.env,
				ownerUserId: context.session.user.id,
				reason: input.reason,
				thinkspaceId: input.thinkspaceId,
			});
		} catch (error) {
			if (error instanceof ThinkspaceApprovalValidationError) {
				throw new ORPCError("BAD_REQUEST", { message: error.message });
			}

			throw error;
		}

		if (!result || result.status === "not_found") {
			throw toNotFound();
		}

		return {
			approvalId: result.approvalId,
			decision: result.decision,
			status: result.status,
			thinkspaceId: result.thinkspaceId,
		};
	}),
};
