import { ORPCError } from "@orpc/server";
import { z } from "zod";

import { protectedProcedure } from "../procedures";
import {
	decideOwnedThinkspaceMemoryApproval,
	ThinkspaceApprovalValidationError,
} from "../thinkspaces/approval-decisions";
import { listPendingThinkspaceApprovalsByOwner } from "../thinkspaces/approvals-repository";

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
 * Approvals: `list` reads the owner-indexed D1 index (every pending Approval
 * across all of a user's Thinkspaces), and `decide` drives the Durable Object
 * that owns the parked turn. Both are owner-scoped — an Approval is invisible
 * and undecidable from any other owner's queue.
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
	list: protectedProcedure.handler(async ({ context }) => {
		const pending = await listPendingThinkspaceApprovalsByOwner(context.db, {
			ownerUserId: context.session.user.id,
		});

		return pending.map(({ approval, thinkspaceGoal }) => ({
			actionKind: approval.actionKind,
			approvalId: approval.id,
			proposedAt: approval.createdAt,
			proposedSummary: approval.proposedSummary,
			thinkspaceGoal,
			thinkspaceId: approval.thinkspaceId,
		}));
	}),
};
