import assert from "node:assert/strict";
import test from "node:test";

import type { ProductDb } from "@better-agent/db";
import { user } from "@better-agent/db/schema/auth";
import { thinkspaceApprovals } from "@better-agent/db/schema/approvals";
import { thinkspaces } from "@better-agent/db/schema/thinkspaces";

import { createTestProductDb } from "../testing/product-db";
import {
	getThinkspaceApproval,
	listPendingThinkspaceApprovals,
	listPendingThinkspaceApprovalsByOwner,
	resolveThinkspaceApproval,
	upsertPendingThinkspaceApproval,
} from "./approvals-repository";
import { createThinkspaceMemory, listThinkspaceMemories } from "./memories-repository";

const OWNER_ID = "owner_user";
const THINKSPACE_ID = "thinkspace_approvals";
const OTHER_THINKSPACE_ID = "thinkspace_approvals_other";

const seed = async (db: ProductDb) => {
	await db.insert(user).values({ email: "owner@example.com", id: OWNER_ID, name: "Owner" });
	await db.insert(thinkspaces).values([
		{ goal: "Decide vendors", id: THINKSPACE_ID, ownerUserId: OWNER_ID, status: "active" },
		{ goal: "Other", id: OTHER_THINKSPACE_ID, ownerUserId: OWNER_ID, status: "active" },
	]);
};

const pendingRecord = (overrides: Record<string, unknown> = {}) => ({
	actionKind: "memory_write",
	approvalRequestId: "approval_req_1",
	id: "approval_1",
	ownerUserId: OWNER_ID,
	profileRevisionId: "rev_1",
	profileVersion: 1,
	proposedContent: "The user prefers Vendor A.",
	proposedSummary: 'Proposed a durable Product Memory: "The user prefers Vendor A."',
	submissionId: null,
	thinkspaceId: THINKSPACE_ID,
	toolCallId: "tool_call_1",
	...overrides,
});

test("a pending Approval is recorded once and reconciling the same parked hold returns the same row", async () => {
	const db = createTestProductDb();
	await seed(db);

	const first = await upsertPendingThinkspaceApproval(db, { record: pendingRecord() });
	assert.equal(first.status, "pending");
	assert.equal(first.proposedContent, "The user prefers Vendor A.");

	// A second reconcile of the same (thinkspaceId, toolCallId) — note a fresh
	// generated id — must resolve to the existing row, never a duplicate.
	const second = await upsertPendingThinkspaceApproval(db, {
		record: pendingRecord({ id: "approval_regenerated" }),
	});
	assert.equal(second.id, first.id);

	const pending = await listPendingThinkspaceApprovals(db, { thinkspaceId: THINKSPACE_ID });
	assert.equal(pending.length, 1);
});

test("an Approval is sealed to its Thinkspace: a forged id from elsewhere never resolves", async () => {
	const db = createTestProductDb();
	await seed(db);
	await upsertPendingThinkspaceApproval(db, { record: pendingRecord() });

	const found = await getThinkspaceApproval(db, {
		approvalId: "approval_1",
		thinkspaceId: THINKSPACE_ID,
	});
	assert.ok(found);

	const fromOtherThinkspace = await getThinkspaceApproval(db, {
		approvalId: "approval_1",
		thinkspaceId: OTHER_THINKSPACE_ID,
	});
	assert.equal(fromOtherThinkspace, null);
});

test("resolving moves an Approval out of the queue and is a no-op the second time", async () => {
	const db = createTestProductDb();
	await seed(db);
	await upsertPendingThinkspaceApproval(db, { record: pendingRecord() });

	const resolvedAt = new Date();
	const resolved = await resolveThinkspaceApproval(db, {
		approvalId: "approval_1",
		resolvedAt,
		status: "approved",
		thinkspaceId: THINKSPACE_ID,
	});
	assert.equal(resolved?.status, "approved");
	assert.ok(resolved?.resolvedAt);

	// A resolved Approval leaves the queue.
	assert.deepEqual(await listPendingThinkspaceApprovals(db, { thinkspaceId: THINKSPACE_ID }), []);

	// A late or duplicate decision cannot overwrite the earlier one.
	const again = await resolveThinkspaceApproval(db, {
		approvalId: "approval_1",
		resolvedAt: new Date(),
		status: "rejected",
		thinkspaceId: THINKSPACE_ID,
	});
	assert.equal(again, null);

	const stored = await getThinkspaceApproval(db, {
		approvalId: "approval_1",
		thinkspaceId: THINKSPACE_ID,
	});
	assert.equal(stored?.status, "approved");
});

test("the owner's Review Queue lists every pending Approval across their Thinkspaces, most-recent first, each named by its Thinkspace", async () => {
	const db = createTestProductDb();
	await seed(db);

	await db.insert(thinkspaceApprovals).values([
		{
			actionKind: "memory_write",
			approvalRequestId: "req_old",
			createdAt: new Date(1000),
			id: "approval_old",
			ownerUserId: OWNER_ID,
			proposedContent: "Older proposal.",
			proposedSummary: "Older proposal.",
			thinkspaceId: THINKSPACE_ID,
			toolCallId: "tool_old",
		},
		{
			actionKind: "memory_write",
			approvalRequestId: "req_new",
			createdAt: new Date(2000),
			id: "approval_new",
			ownerUserId: OWNER_ID,
			proposedContent: "Newer proposal.",
			proposedSummary: "Newer proposal.",
			thinkspaceId: OTHER_THINKSPACE_ID,
			toolCallId: "tool_new",
		},
	]);

	const queue = await listPendingThinkspaceApprovalsByOwner(db, { ownerUserId: OWNER_ID });

	assert.deepEqual(
		queue.map((item) => item.approval.id),
		["approval_new", "approval_old"],
	);
	assert.equal(queue[0]?.thinkspaceGoal, "Other");
	assert.equal(queue[1]?.thinkspaceGoal, "Decide vendors");
});

test("a resolved Approval and another owner's pending Approval never appear in the queue", async () => {
	const db = createTestProductDb();
	await seed(db);
	await db.insert(user).values({ email: "other@example.com", id: "other_owner", name: "Other" });
	await db.insert(thinkspaces).values({
		goal: "Someone else's",
		id: "thinkspace_other_owner",
		ownerUserId: "other_owner",
		status: "active",
	});
	await db.insert(thinkspaceApprovals).values([
		{
			actionKind: "memory_write",
			approvalRequestId: "req_pending",
			id: "approval_pending",
			ownerUserId: OWNER_ID,
			proposedContent: "Still pending.",
			proposedSummary: "Still pending.",
			thinkspaceId: THINKSPACE_ID,
			toolCallId: "tool_pending",
		},
		{
			actionKind: "memory_write",
			approvalRequestId: "req_resolved",
			id: "approval_resolved",
			ownerUserId: OWNER_ID,
			proposedContent: "Already decided.",
			proposedSummary: "Already decided.",
			status: "approved",
			thinkspaceId: THINKSPACE_ID,
			toolCallId: "tool_resolved",
		},
		{
			actionKind: "memory_write",
			approvalRequestId: "req_foreign",
			id: "approval_foreign",
			ownerUserId: "other_owner",
			proposedContent: "Not yours.",
			proposedSummary: "Not yours.",
			thinkspaceId: "thinkspace_other_owner",
			toolCallId: "tool_foreign",
		},
	]);

	const queue = await listPendingThinkspaceApprovalsByOwner(db, { ownerUserId: OWNER_ID });
	assert.deepEqual(
		queue.map((item) => item.approval.id),
		["approval_pending"],
	);

	// Owner-scoping is mutual: the other owner sees only their own pending Approval.
	const foreignQueue = await listPendingThinkspaceApprovalsByOwner(db, {
		ownerUserId: "other_owner",
	});
	assert.deepEqual(
		foreignQueue.map((item) => item.approval.id),
		["approval_foreign"],
	);
});

test("an approved Memory is written once and is visible; the same held call never double-writes", async () => {
	const db = createTestProductDb();
	await seed(db);

	const first = await createThinkspaceMemory(db, {
		record: {
			content: "The user prefers Vendor A.",
			id: "memory_1",
			profileRevisionId: "rev_1",
			profileVersion: 1,
			thinkspaceId: THINKSPACE_ID,
			toolCallId: "tool_call_1",
		},
	});
	assert.equal(first.content, "The user prefers Vendor A.");

	// A resumed/retried continuation of the same held call resolves to the
	// already-stored Memory rather than inserting a duplicate.
	const again = await createThinkspaceMemory(db, {
		record: {
			content: "The user prefers Vendor A.",
			id: "memory_regenerated",
			profileRevisionId: "rev_1",
			profileVersion: 1,
			thinkspaceId: THINKSPACE_ID,
			toolCallId: "tool_call_1",
		},
	});
	assert.equal(again.id, first.id);

	const memories = await listThinkspaceMemories(db, { thinkspaceId: THINKSPACE_ID });
	assert.equal(memories.length, 1);
	assert.deepEqual(await listThinkspaceMemories(db, { thinkspaceId: OTHER_THINKSPACE_ID }), []);
});
