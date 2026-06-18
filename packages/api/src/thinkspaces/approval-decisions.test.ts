import assert from "node:assert/strict";
import test from "node:test";

import type { ProductDb } from "@better-agent/db";

import {
	decideOwnedThinkspaceMemoryApproval,
	ThinkspaceApprovalValidationError,
} from "./approval-decisions";
import type { ThinkspaceMemoryApprovalDecisionRequest } from "./approval-decisions";

const env = {
	THINKSPACE_AGENT: {
		idFromName: (name: string) => ({ toString: () => name }),
	},
} as never;

const ownerFound = () => Promise.resolve({ id: "thinkspace_1" });

test("deciding forwards the bound Thinkspace, owner, decision, and reason to the runtime", async () => {
	const seen: ThinkspaceMemoryApprovalDecisionRequest[] = [];

	const result = await decideOwnedThinkspaceMemoryApproval({
		approvalId: "  approval_1  ",
		db: {} as ProductDb,
		decideApproval: ({ request }) => {
			seen.push(request);

			return Promise.resolve({
				approvalId: request.approvalId,
				decision: request.decision,
				status: "applied",
				thinkspaceId: request.thinkspaceId,
			});
		},
		decision: "approved",
		env,
		getThinkspaceByOwner: ownerFound,
		ownerUserId: "owner_user",
		reason: "Looks durable.",
		thinkspaceId: "thinkspace_1",
	});

	assert.deepEqual(seen, [
		{
			approvalId: "approval_1",
			decision: "approved",
			ownerUserId: "owner_user",
			reason: "Looks durable.",
			thinkspaceId: "thinkspace_1",
		},
	]);
	assert.equal(result?.status, "applied");
});

test("a non-owner's decide resolves to null without ever reaching the runtime", async () => {
	let reachedRuntime = false;

	const result = await decideOwnedThinkspaceMemoryApproval({
		approvalId: "approval_1",
		db: {} as ProductDb,
		decideApproval: () => {
			reachedRuntime = true;

			return Promise.resolve({
				approvalId: "approval_1",
				decision: "approved",
				status: "applied",
				thinkspaceId: "thinkspace_1",
			});
		},
		decision: "approved",
		env,
		getThinkspaceByOwner: () => Promise.resolve(null),
		ownerUserId: "other_user",
		thinkspaceId: "thinkspace_1",
	});

	assert.equal(result, null);
	assert.equal(reachedRuntime, false);
});

test("an empty Approval handle is rejected before any ownership or runtime work", async () => {
	await assert.rejects(
		decideOwnedThinkspaceMemoryApproval({
			approvalId: "   ",
			db: {} as ProductDb,
			decideApproval: () => Promise.reject(new Error("must not run")),
			decision: "approved",
			env,
			getThinkspaceByOwner: () => Promise.reject(new Error("must not run")),
			ownerUserId: "owner_user",
			thinkspaceId: "thinkspace_1",
		}),
		ThinkspaceApprovalValidationError,
	);
});
