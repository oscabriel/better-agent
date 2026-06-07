import assert from "node:assert/strict";
import test from "node:test";

import {
	assessPermissionPolicy,
	createToolPermissionPlaceholder,
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

test("permission placeholders keep possible access separate from Approval", () => {
	assert.deepEqual(createToolPermissionPlaceholder({ risk: "unknown", serverId: "custom" }), {
		actions: ["propose_action"],
		approvalRequired: true,
		resource: { serverId: "custom", toolName: "any_explicitly_enabled_tool" },
		risk: "unknown",
		type: "mcp_tool_permission_placeholder",
	});
});
