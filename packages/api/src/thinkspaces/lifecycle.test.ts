import assert from "node:assert/strict";
import test from "node:test";

import {
	createThinkspaceArchivePatch,
	createThinkspaceCreationRecord,
	THINKSPACE_CREATION_DEFAULTS,
	ThinkspaceLifecycleValidationError,
} from "./lifecycle";

test("creates a draft Thinkspace record around a trimmed Goal and reviewable configuration", () => {
	const record = createThinkspaceCreationRecord({
		configurationSummary:
			"  Review repository shape, sources, permissions, and expected artifact.  ",
		goal: "  Prepare a dependency-aligned salvage plan  ",
		id: "thinkspace_test",
		ownerUserId: "user_123",
	});

	assert.equal(record.id, "thinkspace_test");
	assert.equal(record.ownerUserId, "user_123");
	assert.equal(record.goal, "Prepare a dependency-aligned salvage plan");
	assert.equal(
		record.configurationSummary,
		"Review repository shape, sources, permissions, and expected artifact.",
	);
	assert.equal(record.status, "draft");
	assert.equal(record.requestedPermissions, "[]");
	assert.equal(
		record.approvalDefaults,
		JSON.stringify(THINKSPACE_CREATION_DEFAULTS.approvalDefaults),
	);
	assert.equal(
		record.memoryGovernance,
		JSON.stringify(THINKSPACE_CREATION_DEFAULTS.memoryGovernance),
	);
});

test("builds a deterministic configuration summary when none is supplied", () => {
	const record = createThinkspaceCreationRecord({
		goal: "Compare release notes",
		id: "thinkspace_defaults",
		ownerUserId: "user_123",
	});

	assert.match(record.configurationSummary ?? "", /Goal: Compare release notes/u);
	assert.match(record.configurationSummary ?? "", /Skills, requested Permissions/u);
	assert.match(
		record.configurationSummary ?? "",
		/Memory governance starts in user-reviewed mode/u,
	);
});

test("archives an active Thinkspace by marking it inert without deleting it", () => {
	const patch = createThinkspaceArchivePatch("active");

	assert.equal(patch.status, "archived");
	assert.ok(patch.archivedAt instanceof Date);
	assert.equal(patch.updatedAt, patch.archivedAt);
});

test("rejects archiving a Thinkspace that is already archived", () => {
	assert.throws(() => createThinkspaceArchivePatch("archived"), ThinkspaceLifecycleValidationError);
});

test("rejects missing Goal or owner before persistence", () => {
	assert.throws(
		() =>
			createThinkspaceCreationRecord({
				goal: "   ",
				id: "thinkspace_missing_goal",
				ownerUserId: "user_123",
			}),
		ThinkspaceLifecycleValidationError,
	);

	assert.throws(
		() =>
			createThinkspaceCreationRecord({
				goal: "Prepare a bounded plan",
				id: "thinkspace_missing_owner",
				ownerUserId: "",
			}),
		ThinkspaceLifecycleValidationError,
	);
});
