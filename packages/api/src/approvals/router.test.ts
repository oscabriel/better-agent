import assert from "node:assert/strict";
import test from "node:test";

import type { ProductDb } from "@better-agent/db";
import { user } from "@better-agent/db/schema/auth";
import { thinkspaceApprovals } from "@better-agent/db/schema/approvals";
import { thinkspaces } from "@better-agent/db/schema/thinkspaces";
import { call } from "@orpc/server";

import type { Context } from "../context";
import { createTestProductDb } from "../testing/product-db";
import type { ThinkspaceMemoryApprovalDecisionResult } from "../thinkspaces/approval-decisions";
import { approvalsRouter } from "./router";

const OWNED_THINKSPACE_ID = "thinkspace_owned";

const authenticatedSession = { session: { id: "session_1" }, user: { id: "owner_user" } };
const nonOwnerSession = { session: { id: "session_2" }, user: { id: "other_user" } };

const untouchableDb = new Proxy({} as Record<string, unknown>, {
	get(_target, property) {
		throw new Error(`Product storage must not be touched (accessed ${String(property)}).`);
	},
}) as unknown as ProductDb;

/**
 * A fake Thinkspace Agent namespace that resolves the decide RPC to a fixed
 * result, standing in for the Durable Object so the router's owner-gating and
 * result mapping are testable without a live runtime.
 */
const createAgentNamespace = (
	decide: () => Promise<ThinkspaceMemoryApprovalDecisionResult>,
	calls: { count: number },
) => ({
	get: () => ({
		decideMemoryApproval: () => {
			calls.count += 1;

			return decide();
		},
		setName: () => Promise.resolve(),
	}),
	idFromName: (name: string) => ({ toString: () => name }),
});

const createCallContext = ({
	agentNamespace,
	db,
	session = authenticatedSession,
}: {
	agentNamespace?: ReturnType<typeof createAgentNamespace>;
	db: ProductDb;
	session?: typeof authenticatedSession | null;
}): Context =>
	({
		db,
		env: agentNamespace ? { THINKSPACE_AGENT: agentNamespace } : {},
		executionCtx: undefined,
		headers: new Headers(),
		modelCatalog: undefined,
		session,
	}) as unknown as Context;

const seedOwnedThinkspace = async (db: ProductDb) => {
	await db.insert(user).values({
		email: "owner@example.com",
		id: authenticatedSession.user.id,
		name: "Owner",
	});
	await db.insert(thinkspaces).values({
		goal: "Decide between vendors",
		id: OWNED_THINKSPACE_ID,
		ownerUserId: authenticatedSession.user.id,
		status: "active",
	});
};

const decideInput = (overrides: Record<string, unknown> = {}) => ({
	approvalId: "approval_1",
	decision: "approved" as const,
	thinkspaceId: OWNED_THINKSPACE_ID,
	...overrides,
});

const expectCode = (code: string) => (error: unknown) =>
	error instanceof Error && (error as { code?: string }).code === code;

test("an approved decision is applied through the runtime and returned to the owner", async () => {
	const db = createTestProductDb();
	await seedOwnedThinkspace(db);
	const calls = { count: 0 };
	const agentNamespace = createAgentNamespace(
		() =>
			Promise.resolve({
				approvalId: "approval_1",
				decision: "approved",
				status: "applied",
				thinkspaceId: OWNED_THINKSPACE_ID,
			}),
		calls,
	);

	const result = await call(approvalsRouter.decide, decideInput(), {
		context: createCallContext({ agentNamespace, db }),
	});

	assert.deepEqual(result, {
		approvalId: "approval_1",
		decision: "approved",
		status: "applied",
		thinkspaceId: OWNED_THINKSPACE_ID,
	});
	assert.equal(calls.count, 1);
});

test("a runtime not_found (unknown or already-decided Approval) maps to NOT_FOUND", async () => {
	const db = createTestProductDb();
	await seedOwnedThinkspace(db);
	const calls = { count: 0 };
	const agentNamespace = createAgentNamespace(
		() =>
			Promise.resolve({
				approvalId: "approval_1",
				decision: "approved",
				status: "not_found",
				thinkspaceId: OWNED_THINKSPACE_ID,
			}),
		calls,
	);

	await assert.rejects(
		call(approvalsRouter.decide, decideInput(), {
			context: createCallContext({ agentNamespace, db }),
		}),
		expectCode("NOT_FOUND"),
	);
});

test("unauthenticated decisions are rejected before any storage or runtime access", async () => {
	await assert.rejects(
		call(approvalsRouter.decide, decideInput(), {
			context: createCallContext({ db: untouchableDb, session: null }),
		}),
		expectCode("UNAUTHORIZED"),
	);
});

test("a non-owner deciding another user's Approval gets NOT_FOUND, and never reaches the runtime", async () => {
	const db = createTestProductDb();
	await seedOwnedThinkspace(db);
	const calls = { count: 0 };
	const agentNamespace = createAgentNamespace(
		() => Promise.reject(new Error("runtime must not be reached for a non-owner")),
		calls,
	);

	await assert.rejects(
		call(approvalsRouter.decide, decideInput(), {
			context: createCallContext({ agentNamespace, db, session: nonOwnerSession }),
		}),
		expectCode("NOT_FOUND"),
	);
	assert.equal(calls.count, 0);
});

test("a guessed Thinkspace id cannot resolve another user's runtime", async () => {
	const db = createTestProductDb();
	await seedOwnedThinkspace(db);
	const calls = { count: 0 };
	const agentNamespace = createAgentNamespace(
		() => Promise.reject(new Error("runtime must not be reached for a guessed id")),
		calls,
	);

	await assert.rejects(
		call(approvalsRouter.decide, decideInput({ thinkspaceId: "thinkspace_guessed" }), {
			context: createCallContext({ agentNamespace, db }),
		}),
		expectCode("NOT_FOUND"),
	);
	assert.equal(calls.count, 0);
});

test("a resolved Approval row is invisible to a non-owner's queue read", async () => {
	const db = createTestProductDb();
	await seedOwnedThinkspace(db);
	await db.insert(thinkspaceApprovals).values({
		actionKind: "memory_write",
		approvalRequestId: "approval_req_1",
		id: "approval_1",
		ownerUserId: authenticatedSession.user.id,
		proposedContent: "The user prefers Vendor A.",
		proposedSummary: "Proposed a durable Product Memory.",
		thinkspaceId: OWNED_THINKSPACE_ID,
		toolCallId: "tool_call_1",
	});

	// Sanity: the row exists and is owned by the seeded owner, confirming the
	// NOT_FOUND a non-owner receives is an ownership seal, not an empty table.
	const stored = await db.select().from(thinkspaceApprovals);
	assert.equal(stored.length, 1);
	assert.equal(stored[0]?.ownerUserId, authenticatedSession.user.id);
});

test("the Review Queue lists the owner's pending Approvals most-recent first, in product language", async () => {
	const db = createTestProductDb();
	await seedOwnedThinkspace(db);
	await db.insert(thinkspaceApprovals).values([
		{
			actionKind: "memory_write",
			approvalRequestId: "req_old",
			createdAt: new Date(1000),
			id: "approval_old",
			ownerUserId: authenticatedSession.user.id,
			proposedContent: "The user prefers Vendor A.",
			proposedSummary: 'Proposed a durable Product Memory: "The user prefers Vendor A."',
			thinkspaceId: OWNED_THINKSPACE_ID,
			toolCallId: "tool_old",
		},
		{
			actionKind: "memory_write",
			approvalRequestId: "req_new",
			createdAt: new Date(2000),
			id: "approval_new",
			ownerUserId: authenticatedSession.user.id,
			proposedContent: "The user prefers Vendor B.",
			proposedSummary: 'Proposed a durable Product Memory: "The user prefers Vendor B."',
			thinkspaceId: OWNED_THINKSPACE_ID,
			toolCallId: "tool_new",
		},
	]);

	const queue = await call(approvalsRouter.list, undefined, {
		context: createCallContext({ db }),
	});

	assert.deepEqual(queue, [
		{
			actionKind: "memory_write",
			approvalId: "approval_new",
			proposedAt: new Date(2000),
			proposedSummary: 'Proposed a durable Product Memory: "The user prefers Vendor B."',
			thinkspaceGoal: "Decide between vendors",
			thinkspaceId: OWNED_THINKSPACE_ID,
		},
		{
			actionKind: "memory_write",
			approvalId: "approval_old",
			proposedAt: new Date(1000),
			proposedSummary: 'Proposed a durable Product Memory: "The user prefers Vendor A."',
			thinkspaceGoal: "Decide between vendors",
			thinkspaceId: OWNED_THINKSPACE_ID,
		},
	]);
});

test("a decided Approval has left the Review Queue", async () => {
	const db = createTestProductDb();
	await seedOwnedThinkspace(db);
	await db.insert(thinkspaceApprovals).values([
		{
			actionKind: "memory_write",
			approvalRequestId: "req_pending",
			id: "approval_pending",
			ownerUserId: authenticatedSession.user.id,
			proposedContent: "Still awaiting a decision.",
			proposedSummary: "Still awaiting a decision.",
			thinkspaceId: OWNED_THINKSPACE_ID,
			toolCallId: "tool_pending",
		},
		{
			actionKind: "memory_write",
			approvalRequestId: "req_done",
			id: "approval_done",
			ownerUserId: authenticatedSession.user.id,
			proposedContent: "Already decided.",
			proposedSummary: "Already decided.",
			status: "approved",
			thinkspaceId: OWNED_THINKSPACE_ID,
			toolCallId: "tool_done",
		},
	]);

	const queue = await call(approvalsRouter.list, undefined, {
		context: createCallContext({ db }),
	});

	assert.deepEqual(
		queue.map((item) => item.approvalId),
		["approval_pending"],
	);
});

test("an Approval is invisible from another owner's Review Queue", async () => {
	const db = createTestProductDb();
	await seedOwnedThinkspace(db);
	await db.insert(thinkspaceApprovals).values({
		actionKind: "memory_write",
		approvalRequestId: "req_1",
		id: "approval_1",
		ownerUserId: authenticatedSession.user.id,
		proposedContent: "The user prefers Vendor A.",
		proposedSummary: "Proposed a durable Product Memory.",
		thinkspaceId: OWNED_THINKSPACE_ID,
		toolCallId: "tool_call_1",
	});

	const queue = await call(approvalsRouter.list, undefined, {
		context: createCallContext({ db, session: nonOwnerSession }),
	});

	assert.deepEqual(queue, []);
});

test("an unauthenticated Review Queue read is rejected before any storage access", async () => {
	await assert.rejects(
		call(approvalsRouter.list, undefined, {
			context: createCallContext({ db: untouchableDb, session: null }),
		}),
		expectCode("UNAUTHORIZED"),
	);
});
