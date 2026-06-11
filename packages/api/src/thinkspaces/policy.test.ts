import assert from "node:assert/strict";
import test from "node:test";

import {
	assessPermissionPolicy,
	createMcpToolAccessPermissionRequest,
	DEFAULT_APPROVAL_POLICY,
	PermissionPolicyError,
	serializeThinkspaceToolSelections,
} from "./policy";

test("new Thinkspace defaults require explicit approval for mutating or unknown tools", () => {
	assert.equal(DEFAULT_APPROVAL_POLICY.mutating, "draft_or_explicit_approval");
	assert.equal(DEFAULT_APPROVAL_POLICY.unknown, "explicit_approval_required");
});

test("distinguishes possible access from approved action", () => {
	assert.equal(
		assessPermissionPolicy({ hasPermission: false, risk: "read_only" }),
		"possible_access",
	);
	assert.equal(
		assessPermissionPolicy({ hasPermission: true, risk: "mutating" }),
		"approved_action_required",
	);
	assert.equal(
		assessPermissionPolicy({ hasPermission: true, risk: "read_only", standingApproval: true }),
		"allowed_without_approval",
	);
});

test("serializes explicit Thinkspace tool selections and rejects duplicates", () => {
	assert.equal(
		serializeThinkspaceToolSelections([{ risk: "read_only", serverId: "context7" }]),
		JSON.stringify([{ risk: "read_only", serverId: "context7" }]),
	);
	assert.throws(
		() =>
			serializeThinkspaceToolSelections([
				{ risk: "read_only", serverId: "context7" },
				{ risk: "read_only", serverId: "context7" },
			]),
		PermissionPolicyError,
	);
});

test("MCP tool access requests keep possible access separate from Approval", () => {
	assert.deepEqual(createMcpToolAccessPermissionRequest({ risk: "unknown", serverId: "custom" }), {
		kind: "mcp_tool_access",
		reason:
			"Allow this Thinkspace Agent to read all explicitly enabled tools from the custom MCP server.",
		risk: "unknown",
		scope: { type: "server" },
		serverId: "custom",
	});
	assert.deepEqual(
		createMcpToolAccessPermissionRequest({
			risk: "read_only",
			serverId: "cloudflare-docs",
			toolName: "search_docs",
		}),
		{
			kind: "mcp_tool_access",
			reason:
				"Allow this Thinkspace Agent to read search_docs from the cloudflare-docs MCP server.",
			risk: "read_only",
			scope: { toolName: "search_docs", type: "tool" },
			serverId: "cloudflare-docs",
		},
	);
});
