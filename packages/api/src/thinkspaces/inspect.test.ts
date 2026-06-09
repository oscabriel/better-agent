import assert from "node:assert/strict";
import test from "node:test";

import type { ProductDb } from "@better-agent/db";
import type { CloudflareEnv } from "@better-agent/env/types";

import {
	extractThinkspaceTurnProductSafeFailureMessage,
	extractThinkspaceTurnResultText,
	inspectOwnedThinkspaceTurn,
	mapThinkspaceTurnInspection,
	markThinkspaceTurnProductSafeError,
	THINKSPACE_TURN_RESULT_TEXT_MAX_LENGTH,
	THINKSPACE_TURN_SUBMISSION_ID_MAX_LENGTH,
	validateThinkspaceTurnSubmissionId,
} from "./inspect";
import type { ThinkspaceRuntimeSubmissionSnapshot, ThinkspaceTurnInspection } from "./inspect";
import { ThinkspaceRuntimeResolutionError } from "./runtime";
import { ThinkspaceTurnValidationError } from "./turns";

const db = {} as ProductDb;

const createEnv = (): Pick<CloudflareEnv, "THINKSPACE_AGENT"> => ({
	THINKSPACE_AGENT: {
		idFromName: (name: string) =>
			({
				toString: () => `durable-object-id:${name}`,
			}) as DurableObjectId,
	} as DurableObjectNamespace,
});

const createSnapshot = (
	overrides: Partial<ThinkspaceRuntimeSubmissionSnapshot> = {},
): ThinkspaceRuntimeSubmissionSnapshot => ({
	createdAt: 1_717_000_000_000,
	metadata: { source: "better-agent", thinkspaceId: "thinkspace_inspect" },
	status: "pending",
	submissionId: "submission_1",
	...overrides,
});

const unknownInspection = (
	submissionId = "submission_1",
): Pick<ThinkspaceTurnInspection, "resultText" | "status" | "submissionId"> => ({
	resultText: null,
	status: "unknown",
	submissionId,
});

test("validates submission ids as bounded and non-empty", () => {
	assert.equal(validateThinkspaceTurnSubmissionId("  submission_1  "), "submission_1");
	assert.throws(() => validateThinkspaceTurnSubmissionId("   "), ThinkspaceTurnValidationError);
	assert.throws(
		() =>
			validateThinkspaceTurnSubmissionId("s".repeat(THINKSPACE_TURN_SUBMISSION_ID_MAX_LENGTH + 1)),
		ThinkspaceTurnValidationError,
	);
});

test("product-safe failure messages round-trip through the marker", () => {
	const marked = markThinkspaceTurnProductSafeError(
		"The selected model is not available for this Thinkspace Agent turn.",
	);

	assert.equal(
		extractThinkspaceTurnProductSafeFailureMessage(marked),
		"The selected model is not available for this Thinkspace Agent turn.",
	);
});

test("raw provider or runtime errors are never shown to the product surface", () => {
	const rawProviderError =
		"401 Unauthorized: invalid x-api-key sk-ant-secret at https://api.anthropic.com/v1/messages\n  at fetch (provider.js:42)";

	const message = extractThinkspaceTurnProductSafeFailureMessage(rawProviderError);

	assert.equal(message.includes("sk-ant-secret"), false);
	assert.equal(message.includes("api.anthropic.com"), false);
	assert.equal(message.includes("provider.js"), false);
	assert.equal(message, extractThinkspaceTurnProductSafeFailureMessage());
});

test("extracts the latest assistant text parts as the turn result", () => {
	const resultText = extractThinkspaceTurnResultText([
		{
			parts: [{ text: "First answer.", type: "text" }],
			role: "assistant",
		},
		{
			parts: [{ text: "Follow-up question.", type: "text" }],
			role: "user",
		},
		{
			parts: [
				{ text: "thinking...", type: "reasoning" },
				{ text: "Latest answer, ", type: "text" },
				{ text: "joined safely.", type: "text" },
			],
			role: "assistant",
		},
	]);

	assert.equal(resultText, "Latest answer, joined safely.");
});

test("returns no result text when the runtime has no assistant response", () => {
	assert.equal(extractThinkspaceTurnResultText([]), null);
	assert.equal(
		extractThinkspaceTurnResultText([
			{ parts: [{ text: "Hello", type: "text" }], role: "user" },
			{ parts: [{ text: "", type: "text" }], role: "assistant" },
		]),
		null,
	);
});

test("bounds completed result text for safe rendering", () => {
	const resultText = extractThinkspaceTurnResultText([
		{
			parts: [{ text: "x".repeat(THINKSPACE_TURN_RESULT_TEXT_MAX_LENGTH + 100), type: "text" }],
			role: "assistant",
		},
	]);

	assert.equal(resultText?.length, THINKSPACE_TURN_RESULT_TEXT_MAX_LENGTH);
	assert.equal(resultText?.endsWith("…"), true);
});

test("unknown handles map to a product-safe unknown state", () => {
	const inspection = mapThinkspaceTurnInspection({
		snapshot: null,
		submissionId: "submission_missing",
		thinkspaceId: "thinkspace_inspect",
	});

	assert.deepEqual(
		{
			resultText: inspection.resultText,
			status: inspection.status,
			submissionId: inspection.submissionId,
		},
		unknownInspection("submission_missing"),
	);
	assert.equal(inspection.thinkspaceId, "thinkspace_inspect");
	assert.match(inspection.message, /not known to this Thinkspace/u);
});

test("submissions recorded for a different Thinkspace map to unknown", () => {
	const mismatched = mapThinkspaceTurnInspection({
		snapshot: createSnapshot({
			metadata: { source: "better-agent", thinkspaceId: "thinkspace_other" },
		}),
		submissionId: "submission_1",
		thinkspaceId: "thinkspace_inspect",
	});
	const missingContext = mapThinkspaceTurnInspection({
		snapshot: createSnapshot({ metadata: undefined }),
		submissionId: "submission_1",
		thinkspaceId: "thinkspace_inspect",
	});

	assert.equal(mismatched.status, "unknown");
	assert.equal(missingContext.status, "unknown");
});

test("maps runtime submission lifecycle onto product turn states", () => {
	const accepted = mapThinkspaceTurnInspection({
		snapshot: createSnapshot(),
		submissionId: "submission_1",
		thinkspaceId: "thinkspace_inspect",
	});
	const running = mapThinkspaceTurnInspection({
		snapshot: createSnapshot({ startedAt: 1_717_000_000_500, status: "running" }),
		submissionId: "submission_1",
		thinkspaceId: "thinkspace_inspect",
	});

	assert.equal(accepted.status, "accepted");
	assert.equal(accepted.acceptedAt, 1_717_000_000_000);
	assert.equal(accepted.resultText, null);
	assert.equal(running.status, "running");
	assert.equal(running.startedAt, 1_717_000_000_500);
});

test("completed turns carry the bounded model-only result text", () => {
	const completed = mapThinkspaceTurnInspection({
		resultText: "The Thinkspace goal summary.",
		snapshot: createSnapshot({
			completedAt: 1_717_000_001_000,
			startedAt: 1_717_000_000_500,
			status: "completed",
		}),
		submissionId: "submission_1",
		thinkspaceId: "thinkspace_inspect",
	});

	assert.equal(completed.status, "completed");
	assert.equal(completed.resultText, "The Thinkspace goal summary.");
	assert.equal(completed.completedAt, 1_717_000_001_000);
});

test("failed turns keep product-safe messages and drop raw runtime errors", () => {
	const productSafe = mapThinkspaceTurnInspection({
		snapshot: createSnapshot({
			error: markThinkspaceTurnProductSafeError(
				"Model configuration is missing for this Thinkspace Agent turn.",
			),
			status: "error",
		}),
		submissionId: "submission_1",
		thinkspaceId: "thinkspace_inspect",
	});
	const rawError = mapThinkspaceTurnInspection({
		snapshot: createSnapshot({
			error: "TypeError: fetch failed sk-ant-secret at provider.js:42",
			status: "error",
		}),
		submissionId: "submission_1",
		thinkspaceId: "thinkspace_inspect",
	});
	const aborted = mapThinkspaceTurnInspection({
		snapshot: createSnapshot({ status: "aborted" }),
		submissionId: "submission_1",
		thinkspaceId: "thinkspace_inspect",
	});
	const skipped = mapThinkspaceTurnInspection({
		snapshot: createSnapshot({ status: "skipped" }),
		submissionId: "submission_1",
		thinkspaceId: "thinkspace_inspect",
	});

	assert.equal(productSafe.status, "failed");
	assert.equal(
		productSafe.message,
		"Model configuration is missing for this Thinkspace Agent turn.",
	);
	assert.equal(rawError.status, "failed");
	assert.equal(rawError.message.includes("sk-ant-secret"), false);
	assert.equal(rawError.message.includes("provider.js"), false);
	assert.equal(aborted.status, "failed");
	assert.equal(skipped.status, "failed");
	assert.equal(aborted.resultText, null);
});

test("owner inspection resolves the same Thinkspace runtime identity used for submission", async () => {
	const runtimeCalls: { runtimeName: string; submissionId: string; thinkspaceId: string }[] = [];
	const inspection = await inspectOwnedThinkspaceTurn({
		db,
		env: createEnv(),
		getThinkspaceByOwner: (_db, input) => {
			assert.equal(input.ownerUserId, "owner_user");
			return Promise.resolve({ id: "thinkspace_inspect" });
		},
		inspectTurnSubmission: ({ request, runtimeName }) => {
			runtimeCalls.push({
				runtimeName,
				submissionId: request.submissionId,
				thinkspaceId: request.thinkspaceId,
			});
			return Promise.resolve(
				mapThinkspaceTurnInspection({
					snapshot: createSnapshot(),
					submissionId: request.submissionId,
					thinkspaceId: request.thinkspaceId,
				}),
			);
		},
		ownerUserId: "owner_user",
		submissionId: "  submission_1  ",
		thinkspaceId: "thinkspace_inspect",
	});

	assert.equal(inspection?.status, "accepted");
	assert.equal(inspection?.submissionId, "submission_1");
	assert.deepEqual(runtimeCalls, [
		{
			runtimeName: "thinkspace_inspect",
			submissionId: "submission_1",
			thinkspaceId: "thinkspace_inspect",
		},
	]);
});

test("non-owners cannot inspect runtime work for another user's Thinkspace", async () => {
	let runtimeCallCount = 0;
	const inspection = await inspectOwnedThinkspaceTurn({
		db,
		env: createEnv(),
		getThinkspaceByOwner: () => Promise.resolve(null),
		inspectTurnSubmission: ({ request }) => {
			runtimeCallCount += 1;
			return Promise.resolve(
				mapThinkspaceTurnInspection({
					snapshot: createSnapshot(),
					submissionId: request.submissionId,
					thinkspaceId: request.thinkspaceId,
				}),
			);
		},
		ownerUserId: "other_user",
		submissionId: "submission_1",
		thinkspaceId: "thinkspace_inspect",
	});

	assert.equal(inspection, null);
	assert.equal(runtimeCallCount, 0);
});

test("inspection rejects invalid submission handles before touching the runtime", async () => {
	let runtimeCallCount = 0;
	await assert.rejects(
		inspectOwnedThinkspaceTurn({
			db,
			env: createEnv(),
			getThinkspaceByOwner: () => Promise.resolve({ id: "thinkspace_inspect" }),
			inspectTurnSubmission: ({ request }) => {
				runtimeCallCount += 1;
				return Promise.resolve(
					mapThinkspaceTurnInspection({
						snapshot: createSnapshot(),
						submissionId: request.submissionId,
						thinkspaceId: request.thinkspaceId,
					}),
				);
			},
			ownerUserId: "owner_user",
			submissionId: "   ",
			thinkspaceId: "thinkspace_inspect",
		}),
		ThinkspaceTurnValidationError,
	);

	assert.equal(runtimeCallCount, 0);
});

test("missing runtime binding fails inspection with a runtime resolution error", async () => {
	await assert.rejects(
		inspectOwnedThinkspaceTurn({
			db,
			env: {} as Pick<CloudflareEnv, "THINKSPACE_AGENT">,
			getThinkspaceByOwner: () => Promise.resolve({ id: "thinkspace_inspect" }),
			inspectTurnSubmission: ({ request }) =>
				Promise.resolve(
					mapThinkspaceTurnInspection({
						snapshot: createSnapshot(),
						submissionId: request.submissionId,
						thinkspaceId: request.thinkspaceId,
					}),
				),
			ownerUserId: "owner_user",
			submissionId: "submission_1",
			thinkspaceId: "thinkspace_inspect",
		}),
		ThinkspaceRuntimeResolutionError,
	);
});
