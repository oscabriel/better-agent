import assert from "node:assert/strict";
import test from "node:test";

import type { ProductDb } from "@better-agent/db";
import { ORPCError, call } from "@orpc/server";
import type { AnyProcedure } from "@orpc/server";

import type { Context } from "../context";
import { thinkspacesRouter } from "./router";
import type { ThinkspaceTurnInspection } from "./inspect";
import type { ThinkspaceTurnAcceptance } from "./turns";

const OWNED_THINKSPACE_ID = "thinkspace_router";

/**
 * A db that fails the test if any query is attempted. Used to prove that
 * rejected requests never reach product storage.
 */
const untouchableDb = new Proxy({} as Record<string, unknown>, {
	get(_target, property) {
		throw new Error(`Product storage must not be touched (accessed ${String(property)}).`);
	},
}) as unknown as ProductDb;

/**
 * Minimal structural stand-in for the drizzle select chain used by the
 * Thinkspace repository and model settings reads. Every select resolves to
 * the configured rows.
 */
const createDbReturning = (rows: Record<string, unknown>[]): ProductDb =>
	({
		select: () => ({
			from: () => ({
				where: () => ({
					limit: () => Promise.resolve(rows),
					orderBy: () => Promise.resolve(rows),
				}),
			}),
		}),
	}) as unknown as ProductDb;

const ownedThinkspaceRow = (): Record<string, unknown> => ({
	enabledToolIds: "[]",
	id: OWNED_THINKSPACE_ID,
	requestedPermissions: "[]",
	status: "active",
});

const authenticatedSession = {
	session: { id: "session_1" },
	user: { id: "owner_user" },
};

const createCallContext = ({
	db,
	env = {},
	session = authenticatedSession,
}: {
	db: ProductDb;
	env?: Record<string, unknown>;
	session?: typeof authenticatedSession | null;
}): Context =>
	({
		db,
		env,
		executionCtx: undefined,
		headers: new Headers(),
		session,
	}) as unknown as Context;

interface RuntimeOperationAttempt {
	input: Record<string, string>;
	name: string;
	procedure: AnyProcedure;
}

const runtimeOperations: readonly RuntimeOperationAttempt[] = [
	{
		input: { thinkspaceId: OWNED_THINKSPACE_ID },
		name: "runtimeReadiness",
		procedure: thinkspacesRouter.runtimeReadiness,
	},
	{
		input: { thinkspaceId: OWNED_THINKSPACE_ID },
		name: "runtimePolicy",
		procedure: thinkspacesRouter.runtimePolicy,
	},
	{
		input: { thinkspaceId: OWNED_THINKSPACE_ID },
		name: "modelReadiness",
		procedure: thinkspacesRouter.modelReadiness,
	},
	{
		input: {
			idempotencyKey: "retry-key-1",
			instruction: "Summarize the Thinkspace goal.",
			thinkspaceId: OWNED_THINKSPACE_ID,
		},
		name: "submitTurn",
		procedure: thinkspacesRouter.submitTurn,
	},
	{
		input: { submissionId: "submission_1", thinkspaceId: OWNED_THINKSPACE_ID },
		name: "inspectTurn",
		procedure: thinkspacesRouter.inspectTurn,
	},
];

const expectCode =
	(code: string) =>
	(error: unknown): boolean =>
		error instanceof ORPCError && error.code === code;

test("unauthenticated requests cannot reach any Thinkspace runtime operation", async () => {
	for (const operation of runtimeOperations) {
		await assert.rejects(
			call(operation.procedure, operation.input, {
				context: createCallContext({ db: untouchableDb, session: null }),
			}),
			expectCode("UNAUTHORIZED"),
			`${operation.name} must reject unauthenticated requests`,
		);
	}
});

test("authenticated non-owners get NOT_FOUND for every runtime operation before runtime access", async () => {
	for (const operation of runtimeOperations) {
		await assert.rejects(
			call(operation.procedure, operation.input, {
				context: createCallContext({
					db: createDbReturning([]),
					session: { session: { id: "session_2" }, user: { id: "other_user" } },
				}),
			}),
			expectCode("NOT_FOUND"),
			`${operation.name} must hide other users' Thinkspaces`,
		);
	}
});

test("guessed or missing Thinkspace ids cannot resolve runtime access", async () => {
	for (const operation of runtimeOperations) {
		await assert.rejects(
			call(
				operation.procedure,
				{ ...operation.input, thinkspaceId: "thinkspace_guessed" },
				{ context: createCallContext({ db: createDbReturning([]) }) },
			),
			expectCode("NOT_FOUND"),
			`${operation.name} must not resolve guessed Thinkspace ids`,
		);
	}
});

test("oversized runtime inputs are rejected at the router boundary without touching storage", async () => {
	const oversized: { input: Record<string, string>; procedure: AnyProcedure }[] = [
		{
			input: {
				idempotencyKey: "k".repeat(129),
				instruction: "Summarize the Thinkspace goal.",
				thinkspaceId: OWNED_THINKSPACE_ID,
			},
			procedure: thinkspacesRouter.submitTurn,
		},
		{
			input: {
				idempotencyKey: "retry-key-1",
				instruction: "x".repeat(4001),
				thinkspaceId: OWNED_THINKSPACE_ID,
			},
			procedure: thinkspacesRouter.submitTurn,
		},
		{
			input: { submissionId: "s".repeat(129), thinkspaceId: OWNED_THINKSPACE_ID },
			procedure: thinkspacesRouter.inspectTurn,
		},
	];

	for (const attempt of oversized) {
		await assert.rejects(
			call(attempt.procedure, attempt.input, {
				context: createCallContext({ db: untouchableDb }),
			}),
			expectCode("BAD_REQUEST"),
		);
	}
});

test("runtime resolution failures never expose binding details to the product surface", async () => {
	const operations: { input: Record<string, string>; procedure: AnyProcedure }[] = [
		{
			input: { thinkspaceId: OWNED_THINKSPACE_ID },
			procedure: thinkspacesRouter.runtimeReadiness,
		},
		{
			input: { submissionId: "submission_1", thinkspaceId: OWNED_THINKSPACE_ID },
			procedure: thinkspacesRouter.inspectTurn,
		},
	];

	for (const operation of operations) {
		await assert.rejects(
			call(operation.procedure, operation.input, {
				context: createCallContext({ db: createDbReturning([ownedThinkspaceRow()]) }),
			}),
			(error: unknown) => {
				assert.ok(error instanceof ORPCError);
				assert.equal(error.code, "INTERNAL_SERVER_ERROR");
				assert.doesNotMatch(error.message, /binding/iu);
				assert.doesNotMatch(error.message, /THINKSPACE_AGENT/u);
				assert.doesNotMatch(error.message, /durable/iu);
				return true;
			},
		);
	}
});

test("missing model credentials fail closed with a product-safe error before runtime acceptance", async () => {
	await assert.rejects(
		call(
			thinkspacesRouter.submitTurn,
			{
				idempotencyKey: "retry-key-1",
				instruction: "Summarize the Thinkspace goal.",
				thinkspaceId: OWNED_THINKSPACE_ID,
			},
			{ context: createCallContext({ db: createDbReturning([ownedThinkspaceRow()]) }) },
		),
		(error: unknown) => {
			assert.ok(error instanceof ORPCError);
			assert.equal(error.code, "BAD_REQUEST");
			assert.doesNotMatch(error.message, /API_KEY/u);
			assert.doesNotMatch(error.message, /sk-/u);
			assert.doesNotMatch(error.message, /binding/iu);
			return true;
		},
	);
});

test("owners can still submit and inspect turns through the router with the Thinkspace runtime identity", async () => {
	const runtimeNames: string[] = [];
	const acceptance: ThinkspaceTurnAcceptance = {
		acceptedAt: 1_717_000_000_000,
		deduplicated: false,
		idempotencyKey: "retry-key-1",
		status: "accepted",
		submissionId: "submission_1",
		thinkspaceId: OWNED_THINKSPACE_ID,
	};
	const inspection: ThinkspaceTurnInspection = {
		acceptedAt: 1_717_000_000_000,
		completedAt: null,
		message: "Accepted. This Thinkspace Agent turn is waiting for the runtime to start it.",
		resultText: null,
		startedAt: null,
		status: "accepted",
		submissionId: "submission_1",
		thinkspaceId: OWNED_THINKSPACE_ID,
	};
	const env = {
		GOOGLE_GENERATIVE_AI_API_KEY: "test-google-key",
		THINKSPACE_AGENT: {
			get: () => ({
				acceptTurnSubmission: () => Promise.resolve(acceptance),
				inspectTurnSubmission: () => Promise.resolve(inspection),
			}),
			idFromName: (name: string) => {
				runtimeNames.push(name);
				return { toString: () => `durable-object-id:${name}` };
			},
		},
	};
	const context = createCallContext({ db: createDbReturning([ownedThinkspaceRow()]), env });

	const submitted = await call(
		thinkspacesRouter.submitTurn,
		{
			idempotencyKey: "retry-key-1",
			instruction: "Summarize the Thinkspace goal.",
			thinkspaceId: OWNED_THINKSPACE_ID,
		},
		{ context },
	);
	const inspected = await call(
		thinkspacesRouter.inspectTurn,
		{ submissionId: "submission_1", thinkspaceId: OWNED_THINKSPACE_ID },
		{ context },
	);

	assert.equal(submitted.status, "accepted");
	assert.equal(submitted.submissionId, "submission_1");
	assert.equal(inspected.status, "accepted");
	assert.ok(runtimeNames.every((name) => name === OWNED_THINKSPACE_ID));
});

test("Thinkspace control-plane reads still work for owners", async () => {
	const context = createCallContext({ db: createDbReturning([ownedThinkspaceRow()]) });

	const thinkspace = await call(
		thinkspacesRouter.get,
		{ thinkspaceId: OWNED_THINKSPACE_ID },
		{ context },
	);
	const listed = await call(thinkspacesRouter.list, undefined, { context });

	assert.equal(thinkspace.id, OWNED_THINKSPACE_ID);
	assert.equal(listed.length, 1);
});
