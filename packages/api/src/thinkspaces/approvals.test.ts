import assert from "node:assert/strict";
import test from "node:test";

import {
	extractPendingMemoryApprovals,
	extractResolvedMemoryApprovals,
	flipMemoryApprovalInTranscript,
	summarizeMemoryProposal,
} from "./approvals";

const memoryPart = (overrides: Record<string, unknown> = {}) => ({
	approval: { id: "approval_req_1" },
	input: { content: "The user prefers Vendor A." },
	state: "approval-requested",
	toolCallId: "tool_call_1",
	type: "tool-memory_write",
	...overrides,
});

const assistant = (parts: Record<string, unknown>[]) => ({ parts, role: "assistant" });

test("a parked Memory proposal is extracted with the durable handles a decision needs", () => {
	const pending = extractPendingMemoryApprovals([
		assistant([{ text: "Working on it.", type: "text" }, memoryPart()]),
	]);

	assert.deepEqual(pending, [
		{
			approvalRequestId: "approval_req_1",
			content: "The user prefers Vendor A.",
			toolCallId: "tool_call_1",
		},
	]);
});

test("malformed or non-Memory holds never surface as decidable Approvals", () => {
	const pending = extractPendingMemoryApprovals([
		assistant([
			// A different tool awaiting approval is not this index's concern.
			{
				approval: { id: "a" },
				state: "approval-requested",
				toolCallId: "t",
				type: "tool-web_search",
			},
			// A Memory hold missing its approval id cannot be decided, so it is skipped.
			memoryPart({ approval: {} }),
			// A Memory hold missing content is skipped.
			memoryPart({ input: {}, toolCallId: "tool_call_2" }),
			// Not in the requested state.
			memoryPart({ state: "output-available", toolCallId: "tool_call_3" }),
		]),
	]);

	assert.deepEqual(pending, []);
});

test("decided Memory holds are read back with their outcome for index reconciliation", () => {
	const resolved = extractResolvedMemoryApprovals([
		assistant([
			memoryPart({
				approval: { approved: true, id: "a" },
				state: "output-available",
				toolCallId: "approved_executed",
			}),
			memoryPart({
				approval: { approved: false, id: "b" },
				state: "output-denied",
				toolCallId: "rejected",
			}),
			memoryPart({
				approval: { approved: true, id: "c" },
				state: "approval-responded",
				toolCallId: "approved_pending",
			}),
			// Still parked: not yet resolved.
			memoryPart({ toolCallId: "still_pending" }),
		]),
	]);

	assert.deepEqual(resolved, [
		{ status: "approved", toolCallId: "approved_executed" },
		{ status: "rejected", toolCallId: "rejected" },
		{ status: "approved", toolCallId: "approved_pending" },
	]);
});

test("approving flips exactly the matching parked hold to approval-responded, preserving the approval id", () => {
	const messages = [assistant([{ text: "Note.", type: "text" }, memoryPart()])];

	const result = flipMemoryApprovalInTranscript({
		decision: "approved",
		messages,
		toolCallId: "tool_call_1",
	});

	assert.equal(result.flipped, true);

	const flippedPart = result.messages[0]?.parts?.[1] as Record<string, unknown>;
	assert.equal(flippedPart.state, "approval-responded");
	assert.deepEqual(flippedPart.approval, { approved: true, id: "approval_req_1" });
	// The sibling text part is untouched.
	assert.deepEqual(result.messages[0]?.parts?.[0], { text: "Note.", type: "text" });
	// Purity: the input transcript is never mutated.
	const [inputMessage] = messages;
	assert.ok(inputMessage);
	assert.equal((inputMessage.parts[1] as Record<string, unknown>).state, "approval-requested");
});

test("rejecting flips the hold to a denial and carries an optional reason", () => {
	const messages = [assistant([memoryPart()])];

	const result = flipMemoryApprovalInTranscript({
		decision: "rejected",
		messages,
		reason: "Not durable enough.",
		toolCallId: "tool_call_1",
	});

	assert.equal(result.flipped, true);
	const flippedPart = result.messages[0]?.parts?.[0] as Record<string, unknown>;
	assert.deepEqual(flippedPart.approval, {
		approved: false,
		id: "approval_req_1",
		reason: "Not durable enough.",
	});
});

test("a decision for a hold that is no longer parked reports no flip so the caller fails closed", () => {
	const messages = [assistant([memoryPart({ state: "output-available" })])];

	const result = flipMemoryApprovalInTranscript({
		decision: "approved",
		messages,
		toolCallId: "tool_call_1",
	});

	assert.equal(result.flipped, false);
	assert.deepEqual(result.messages, messages);
});

test("a Memory proposal summary collapses whitespace and bounds length for the queue", () => {
	const summary = summarizeMemoryProposal("  Vendor A\n\n   is preferred   ");
	assert.equal(summary, 'Proposed a durable Product Memory: "Vendor A is preferred"');

	const long = summarizeMemoryProposal("x".repeat(500));
	assert.ok(long.length < 500);
	assert.match(long, /…"$/u);
});
