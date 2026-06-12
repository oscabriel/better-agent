import assert from "node:assert/strict";
import test from "node:test";

import type { ProductDb } from "@better-agent/db";
import type { CloudflareEnv } from "@better-agent/env/types";

import { ThinkspaceTurnModelUnavailableError } from "../models/readiness";
import type { ThinkspaceModelReadiness } from "../models/readiness";
import { ThinkspaceRuntimeResolutionError } from "./runtime";
import {
	submitOwnedThinkspaceTurn,
	THINKSPACE_TURN_IDEMPOTENCY_KEY_MAX_LENGTH,
	THINKSPACE_TURN_INSTRUCTION_MAX_LENGTH,
	ThinkspaceTurnValidationError,
	validateThinkspaceTurnIdempotencyKey,
	validateThinkspaceTurnInstruction,
} from "./turns";
import type { ThinkspaceTurnAcceptance } from "./turns";

const db = {} as ProductDb;

const createEnv = (): Pick<CloudflareEnv, "BETTER_AUTH_SECRET" | "THINKSPACE_AGENT"> & {
	API_ENCRYPTION_KEY?: string;
} => ({
	BETTER_AUTH_SECRET: "test-secret",
	THINKSPACE_AGENT: {
		idFromName: (name: string) =>
			({
				toString: () => `durable-object-id:${name}`,
			}) as DurableObjectId,
	} as DurableObjectNamespace,
});

const readyReadiness: ThinkspaceModelReadiness = {
	message: "Model configuration is ready for a Thinkspace Agent turn.",
	modelId: "google:gemini-2.5-flash-lite",
	modelName: "Gemini 2.5 Flash Lite",
	providerId: "google",
	providerName: "Google",
	reasoningEffort: "medium",
	status: "ready",
};

const notReadyReadiness: ThinkspaceModelReadiness = {
	message: "The saved provider credential for this model is not available.",
	modelId: "google:gemini-2.5-flash-lite",
	reason: "missing_user_credential",
	reasoningEffort: "medium",
	status: "not_ready",
};

const createOwnedThinkspace = (status: "active" | "archived" = "active") => ({
	id: "thinkspace_turns",
	requestedPermissions: "[]",
	status,
});

const activeRevision = {
	id: "profile_revision_active",
	modelBehavior: { modelId: "google:gemini-2.5-flash-lite", reasoningLevel: "medium" },
	version: 2,
};

const acceptedHandle = (idempotencyKey: string): ThinkspaceTurnAcceptance => ({
	acceptedAt: 1_717_000_000_000,
	deduplicated: false,
	idempotencyKey,
	profileRevisionId: "profile_revision_active",
	profileVersion: 2,
	status: "accepted",
	submissionId: "submission_1",
	thinkspaceId: "thinkspace_turns",
});

test("validates turn instructions as bounded and non-empty", () => {
	assert.equal(validateThinkspaceTurnInstruction("  Summarize the goal.  "), "Summarize the goal.");
	assert.throws(() => validateThinkspaceTurnInstruction("   "), ThinkspaceTurnValidationError);
	assert.throws(
		() => validateThinkspaceTurnInstruction("x".repeat(THINKSPACE_TURN_INSTRUCTION_MAX_LENGTH + 1)),
		ThinkspaceTurnValidationError,
	);
});

test("validates idempotency keys as bounded and non-empty", () => {
	assert.equal(validateThinkspaceTurnIdempotencyKey(" retry-key-1 "), "retry-key-1");
	assert.throws(() => validateThinkspaceTurnIdempotencyKey(""), ThinkspaceTurnValidationError);
	assert.throws(
		() => validateThinkspaceTurnIdempotencyKey("k".repeat(129)),
		ThinkspaceTurnValidationError,
	);
});

test("owner submission is durably accepted through the Thinkspace runtime identity", async () => {
	const runtimeCalls: { idempotencyKey: string; instruction: string; runtimeName: string }[] = [];
	const acceptance = await submitOwnedThinkspaceTurn({
		acceptTurnSubmission: ({ request, runtimeName }) => {
			runtimeCalls.push({
				idempotencyKey: request.idempotencyKey,
				instruction: request.instruction,
				runtimeName,
			});
			return Promise.resolve(acceptedHandle(request.idempotencyKey));
		},
		checkModelReadiness: () => Promise.resolve(readyReadiness),
		db,
		env: createEnv(),
		getActiveRevision: () => Promise.resolve(activeRevision as never),
		getThinkspaceByOwner: (_db, input) => {
			assert.equal(input.ownerUserId, "owner_user");
			return Promise.resolve(createOwnedThinkspace());
		},
		idempotencyKey: "  retry-key-1  ",
		instruction: "  Summarize the Thinkspace goal.  ",
		ownerUserId: "owner_user",
		thinkspaceId: "thinkspace_turns",
	});

	assert.equal(acceptance?.status, "accepted");
	assert.equal(acceptance?.submissionId, "submission_1");
	assert.deepEqual(runtimeCalls, [
		{
			idempotencyKey: "retry-key-1",
			instruction: "Summarize the Thinkspace goal.",
			runtimeName: "thinkspace_turns",
		},
	]);
});

test("repeated submission with the same idempotency key returns the same handle without new work", async () => {
	const acceptedKeys = new Map<string, ThinkspaceTurnAcceptance>();
	const submit = (idempotencyKey: string) =>
		submitOwnedThinkspaceTurn({
			acceptTurnSubmission: ({ request }) => {
				const existing = acceptedKeys.get(request.idempotencyKey);
				if (existing) {
					return Promise.resolve({ ...existing, deduplicated: true });
				}
				const handle = acceptedHandle(request.idempotencyKey);
				acceptedKeys.set(request.idempotencyKey, handle);
				return Promise.resolve(handle);
			},
			checkModelReadiness: () => Promise.resolve(readyReadiness),
			db,
			env: createEnv(),
			getActiveRevision: () => Promise.resolve(activeRevision as never),
			getThinkspaceByOwner: () => Promise.resolve(createOwnedThinkspace()),
			idempotencyKey,
			instruction: "Summarize the Thinkspace goal.",
			ownerUserId: "owner_user",
			thinkspaceId: "thinkspace_turns",
		});

	const first = await submit("retry-key-1");
	const retry = await submit("retry-key-1");

	assert.equal(first?.deduplicated, false);
	assert.equal(retry?.deduplicated, true);
	assert.equal(first?.submissionId, retry?.submissionId);
	assert.equal(acceptedKeys.size, 1);
});

test("whitespace-padded idempotency keys dedupe to the same accepted submission", async () => {
	const acceptedKeys = new Map<string, ThinkspaceTurnAcceptance>();
	const submit = (idempotencyKey: string) =>
		submitOwnedThinkspaceTurn({
			acceptTurnSubmission: ({ request }) => {
				const existing = acceptedKeys.get(request.idempotencyKey);
				if (existing) {
					return Promise.resolve({ ...existing, deduplicated: true });
				}
				const handle = acceptedHandle(request.idempotencyKey);
				acceptedKeys.set(request.idempotencyKey, handle);
				return Promise.resolve(handle);
			},
			checkModelReadiness: () => Promise.resolve(readyReadiness),
			db,
			env: createEnv(),
			getActiveRevision: () => Promise.resolve(activeRevision as never),
			getThinkspaceByOwner: () => Promise.resolve(createOwnedThinkspace()),
			idempotencyKey,
			instruction: "Summarize the Thinkspace goal.",
			ownerUserId: "owner_user",
			thinkspaceId: "thinkspace_turns",
		});

	const first = await submit("retry-key-1");
	const padded = await submit("  retry-key-1  ");

	assert.equal(first?.deduplicated, false);
	assert.equal(padded?.deduplicated, true);
	assert.equal(first?.submissionId, padded?.submissionId);
	assert.equal(acceptedKeys.size, 1);
});

test("idempotency keys at the documented bound are accepted and forwarded intact", async () => {
	const boundaryKey = "k".repeat(THINKSPACE_TURN_IDEMPOTENCY_KEY_MAX_LENGTH);
	const forwardedKeys: string[] = [];

	const acceptance = await submitOwnedThinkspaceTurn({
		acceptTurnSubmission: ({ request }) => {
			forwardedKeys.push(request.idempotencyKey);
			return Promise.resolve(acceptedHandle(request.idempotencyKey));
		},
		checkModelReadiness: () => Promise.resolve(readyReadiness),
		db,
		env: createEnv(),
		getActiveRevision: () => Promise.resolve(activeRevision as never),
		getThinkspaceByOwner: () => Promise.resolve(createOwnedThinkspace()),
		idempotencyKey: boundaryKey,
		instruction: "Summarize the Thinkspace goal.",
		ownerUserId: "owner_user",
		thinkspaceId: "thinkspace_turns",
	});

	assert.equal(acceptance?.status, "accepted");
	assert.deepEqual(forwardedKeys, [boundaryKey]);
});

test("non-owners cannot submit runtime work to another user's Thinkspace", async () => {
	let runtimeCallCount = 0;
	const acceptance = await submitOwnedThinkspaceTurn({
		acceptTurnSubmission: ({ request }) => {
			runtimeCallCount += 1;
			return Promise.resolve(acceptedHandle(request.idempotencyKey));
		},
		checkModelReadiness: () => Promise.resolve(readyReadiness),
		db,
		env: createEnv(),
		getActiveRevision: () => Promise.resolve(activeRevision as never),
		getThinkspaceByOwner: () => Promise.resolve(null),
		idempotencyKey: "retry-key-1",
		instruction: "Summarize the Thinkspace goal.",
		ownerUserId: "other_user",
		thinkspaceId: "thinkspace_turns",
	});

	assert.equal(acceptance, null);
	assert.equal(runtimeCallCount, 0);
});

test("archived Thinkspaces reject new turns", async () => {
	await assert.rejects(
		submitOwnedThinkspaceTurn({
			acceptTurnSubmission: ({ request }) =>
				Promise.resolve(acceptedHandle(request.idempotencyKey)),
			checkModelReadiness: () => Promise.resolve(readyReadiness),
			db,
			env: createEnv(),
			getActiveRevision: () => Promise.resolve(activeRevision as never),
			getThinkspaceByOwner: () => Promise.resolve(createOwnedThinkspace("archived")),
			idempotencyKey: "retry-key-1",
			instruction: "Summarize the Thinkspace goal.",
			ownerUserId: "owner_user",
			thinkspaceId: "thinkspace_turns",
		}),
		ThinkspaceTurnValidationError,
	);
});

test("missing or disallowed model configuration fails closed before runtime acceptance", async () => {
	let runtimeCallCount = 0;
	await assert.rejects(
		submitOwnedThinkspaceTurn({
			acceptTurnSubmission: ({ request }) => {
				runtimeCallCount += 1;
				return Promise.resolve(acceptedHandle(request.idempotencyKey));
			},
			checkModelReadiness: () => Promise.resolve(notReadyReadiness),
			db,
			env: createEnv(),
			getActiveRevision: () => Promise.resolve(activeRevision as never),
			getThinkspaceByOwner: () => Promise.resolve(createOwnedThinkspace()),
			idempotencyKey: "retry-key-1",
			instruction: "Summarize the Thinkspace goal.",
			ownerUserId: "owner_user",
			thinkspaceId: "thinkspace_turns",
		}),
		ThinkspaceTurnModelUnavailableError,
	);

	assert.equal(runtimeCallCount, 0);
});

test("default runtime adapter initializes the runtime before accepting the turn", async () => {
	const runtimeCalls: string[] = [];
	const env = {
		BETTER_AUTH_SECRET: "test-secret",
		THINKSPACE_AGENT: {
			get: () => ({
				acceptTurnSubmission: (request: { idempotencyKey: string }) => {
					runtimeCalls.push("acceptTurnSubmission");
					return Promise.resolve(acceptedHandle(request.idempotencyKey));
				},
				setName: (name: string) => {
					runtimeCalls.push(`setName:${name}`);
					return Promise.resolve();
				},
			}),
			idFromName: (name: string) =>
				({
					toString: () => `durable-object-id:${name}`,
				}) as DurableObjectId,
		} as unknown as DurableObjectNamespace,
	} as Pick<CloudflareEnv, "BETTER_AUTH_SECRET" | "THINKSPACE_AGENT">;

	const acceptance = await submitOwnedThinkspaceTurn({
		checkModelReadiness: () => Promise.resolve(readyReadiness),
		db,
		env,
		getActiveRevision: () => Promise.resolve(activeRevision as never),
		getThinkspaceByOwner: () => Promise.resolve(createOwnedThinkspace()),
		idempotencyKey: "runtime-init-key-1",
		instruction: "Summarize the Thinkspace goal.",
		ownerUserId: "owner_user",
		thinkspaceId: "thinkspace_turns",
	});

	assert.equal(acceptance?.status, "accepted");
	assert.deepEqual(runtimeCalls, ["setName:thinkspace_turns", "acceptTurnSubmission"]);
});

test("missing runtime binding fails with a runtime resolution error", async () => {
	await assert.rejects(
		submitOwnedThinkspaceTurn({
			acceptTurnSubmission: ({ request }) =>
				Promise.resolve(acceptedHandle(request.idempotencyKey)),
			checkModelReadiness: () => Promise.resolve(readyReadiness),
			db,
			env: { BETTER_AUTH_SECRET: "test-secret" } as Pick<
				CloudflareEnv,
				"BETTER_AUTH_SECRET" | "THINKSPACE_AGENT"
			>,
			getActiveRevision: () => Promise.resolve(activeRevision as never),
			getThinkspaceByOwner: () => Promise.resolve(createOwnedThinkspace()),
			idempotencyKey: "retry-key-1",
			instruction: "Summarize the Thinkspace goal.",
			ownerUserId: "owner_user",
			thinkspaceId: "thinkspace_turns",
		}),
		ThinkspaceRuntimeResolutionError,
	);
});
