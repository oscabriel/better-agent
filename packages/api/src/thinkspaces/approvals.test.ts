import assert from "node:assert/strict";
import test from "node:test";

import {
	CREATE_GITHUB_ISSUE_TOOL_PART_TYPE,
	extractPendingApprovals,
	extractResolvedApprovals,
	flipApprovalInTranscript,
	MEMORY_WRITE_TOOL_PART_TYPE,
	parseProposedGitHubIssue,
	parseProposedMcpToolCall,
	readProposedGitHubIssue,
	summarizeGitHubIssueProposal,
	summarizeMcpToolCall,
	summarizeMemoryProposal,
} from "./approvals";

const memoryPart = (overrides: Record<string, unknown> = {}) => ({
	approval: { id: "approval_req_1" },
	input: { content: "The user prefers Vendor A." },
	state: "approval-requested",
	toolCallId: "tool_call_1",
	type: MEMORY_WRITE_TOOL_PART_TYPE,
	...overrides,
});

const githubPart = (overrides: Record<string, unknown> = {}) => ({
	approval: { id: "approval_req_gh" },
	input: {
		body: "Steps to reproduce the flake.",
		repo: "octocat/hello-world",
		title: "Fix the flaky test",
	},
	state: "approval-requested",
	toolCallId: "tool_call_gh",
	type: CREATE_GITHUB_ISSUE_TOOL_PART_TYPE,
	...overrides,
});

const mcpToolPart = (overrides: Record<string, unknown> = {}) => ({
	approval: { id: "approval_req_mcp" },
	input: { repo: "octocat/hello-world", title: "Ship it" },
	state: "approval-requested",
	toolCallId: "tool_call_mcp",
	type: "tool-tool_mutatingdocs_open_pr",
	...overrides,
});

const assistant = (parts: Record<string, unknown>[]) => ({ parts, role: "assistant" });

test("a parked Memory proposal is extracted with its kind and durable handles", () => {
	const pending = extractPendingApprovals([
		assistant([{ text: "Working on it.", type: "text" }, memoryPart()]),
	]);

	assert.deepEqual(pending, [
		{
			actionKind: "memory_write",
			approvalRequestId: "approval_req_1",
			proposedContent: "The user prefers Vendor A.",
			proposedSummary: 'Proposed a durable Product Memory: "The user prefers Vendor A."',
			toolCallId: "tool_call_1",
		},
	]);
});

test("a parked GitHub-issue proposal is extracted with a serialized payload and a repo-bearing summary", () => {
	const [pending, ...rest] = extractPendingApprovals([
		assistant([{ text: "Drafting an issue.", type: "text" }, githubPart()]),
	]);

	assert.equal(rest.length, 0);
	assert.ok(pending);
	assert.equal(pending.actionKind, "github_create_issue");
	assert.equal(pending.approvalRequestId, "approval_req_gh");
	assert.equal(pending.toolCallId, "tool_call_gh");
	assert.equal(pending.proposedSummary, 'Create issue "Fix the flaky test" in octocat/hello-world');
	assert.deepEqual(parseProposedGitHubIssue(pending.proposedContent), {
		body: "Steps to reproduce the flake.",
		repo: "octocat/hello-world",
		title: "Fix the flaky test",
	});
});

test("a parked MCP tool call is extracted with a dynamic part type and its args preserved", () => {
	const [pending, ...rest] = extractPendingApprovals([
		assistant([{ text: "Opening a PR.", type: "text" }, mcpToolPart()]),
	]);

	assert.equal(rest.length, 0);
	assert.ok(pending);
	assert.equal(pending.actionKind, "mcp_tool_call");
	assert.equal(pending.approvalRequestId, "approval_req_mcp");
	assert.equal(pending.toolCallId, "tool_call_mcp");
	assert.equal(pending.proposedSummary, 'Call the external tool "mutatingdocs_open_pr"');
	assert.deepEqual(parseProposedMcpToolCall(pending.proposedContent), {
		args: { repo: "octocat/hello-world", title: "Ship it" },
		runtimeToolName: "tool_mutatingdocs_open_pr",
	});
});

test("a held MCP tool call flips and reads back like any other hold", () => {
	const messages = [assistant([mcpToolPart()])];
	const flip = flipApprovalInTranscript({
		decision: "approved",
		messages,
		toolCallId: "tool_call_mcp",
	});

	assert.equal(flip.flipped, true);
	const resolved = extractResolvedApprovals(flip.messages);
	assert.deepEqual(resolved, [{ status: "approved", toolCallId: "tool_call_mcp" }]);
});

test("an MCP tool-call summary strips the runtime prefix and bounds length", () => {
	assert.equal(summarizeMcpToolCall("tool_server_do_thing"), 'Call the external tool "server_do_thing"');

	const long = summarizeMcpToolCall(`tool_${"x".repeat(500)}`);
	assert.ok(long.length < 500);
	assert.match(long, /…"$/u);
});

test("a malformed MCP tool-call payload parses back to null", () => {
	assert.equal(parseProposedMcpToolCall("not json"), null);
	assert.equal(parseProposedMcpToolCall(JSON.stringify({ args: {} })), null);
	assert.deepEqual(parseProposedMcpToolCall(JSON.stringify({ runtimeToolName: "tool_x" })), {
		args: {},
		runtimeToolName: "tool_x",
	});
});

test("malformed or unregistered holds never surface as decidable Approvals", () => {
	const pending = extractPendingApprovals([
		assistant([
			// A different tool awaiting approval is not the index's concern.
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
			// A GitHub hold missing its repo cannot name a target, so it is skipped.
			githubPart({ input: { body: "b", title: "t" }, toolCallId: "tool_call_4" }),
		]),
	]);

	assert.deepEqual(pending, []);
});

test("decided holds of either kind are read back with their outcome for index reconciliation", () => {
	const resolved = extractResolvedApprovals([
		assistant([
			memoryPart({
				approval: { approved: true, id: "a" },
				state: "output-available",
				toolCallId: "memory_executed",
			}),
			githubPart({
				approval: { approved: true, id: "b" },
				state: "output-available",
				toolCallId: "issue_created",
			}),
			githubPart({
				approval: { approved: false, id: "c" },
				state: "output-denied",
				toolCallId: "issue_rejected",
			}),
			// Still parked: not yet resolved.
			memoryPart({ toolCallId: "still_pending" }),
		]),
	]);

	assert.deepEqual(resolved, [
		{ status: "approved", toolCallId: "memory_executed" },
		{ status: "approved", toolCallId: "issue_created" },
		{ status: "rejected", toolCallId: "issue_rejected" },
	]);
});

test("approving flips exactly the matching parked hold to approval-responded, preserving the approval id", () => {
	const messages = [assistant([{ text: "Note.", type: "text" }, memoryPart()])];

	const result = flipApprovalInTranscript({
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

test("the flip is action-kind-agnostic: a parked GitHub-issue hold flips the same way", () => {
	const messages = [assistant([githubPart()])];

	const result = flipApprovalInTranscript({
		decision: "approved",
		messages,
		toolCallId: "tool_call_gh",
	});

	assert.equal(result.flipped, true);
	const flippedPart = result.messages[0]?.parts?.[0] as Record<string, unknown>;
	assert.equal(flippedPart.state, "approval-responded");
	assert.deepEqual(flippedPart.approval, { approved: true, id: "approval_req_gh" });
});

test("rejecting flips the hold to a denial and carries an optional reason", () => {
	const messages = [assistant([memoryPart()])];

	const result = flipApprovalInTranscript({
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

	const result = flipApprovalInTranscript({
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

test("a GitHub-issue summary names the repo prominently and bounds the title", () => {
	assert.equal(
		summarizeGitHubIssueProposal({ repo: "octocat/hello-world", title: "  Fix the   flake  " }),
		'Create issue "Fix the flake" in octocat/hello-world',
	);

	const long = summarizeGitHubIssueProposal({
		repo: "octocat/hello-world",
		title: "x".repeat(500),
	});
	assert.ok(long.endsWith(" in octocat/hello-world"));
	assert.match(long, /…" in /u);
});

test("a GitHub issue payload round-trips and rejects malformed input", () => {
	const issue = { body: "b", repo: "octocat/hello-world", title: "t" };
	assert.deepEqual(readProposedGitHubIssue(issue), issue);
	assert.deepEqual(parseProposedGitHubIssue(JSON.stringify(issue)), issue);

	assert.equal(readProposedGitHubIssue({ body: "b", title: "t" }), null);
	assert.equal(readProposedGitHubIssue(null), null);
	assert.equal(parseProposedGitHubIssue("not json"), null);
});
