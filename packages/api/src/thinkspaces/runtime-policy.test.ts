import assert from "node:assert/strict";
import test from "node:test";

import type { ProductDb } from "@better-agent/db";

import {
	createThinkspaceRuntimeToolSet,
	createThinkspaceRuntimeTurnConfig,
	getOwnedThinkspaceRuntimePolicy,
	isThinkspaceRuntimeCapabilityEnabled,
	THINKSPACE_RUNTIME_CAPABILITY_IDS,
	THINKSPACE_RUNTIME_DISABLED_CAPABILITY_IDS,
	THINKSPACE_RUNTIME_ENABLED_CAPABILITY_IDS,
	THINKSPACE_RUNTIME_HELD_EXTERNAL_WRITE_CAPABILITY_ID,
	THINKSPACE_RUNTIME_HELD_WRITE_CAPABILITY_ID,
	THINKSPACE_RUNTIME_POLICY,
} from "./runtime-policy";

test("disables workspace Bash against the runtime default", () => {
	assert.equal(THINKSPACE_RUNTIME_POLICY.workspaceBash, false);
	assert.equal(
		isThinkspaceRuntimeCapabilityEnabled(THINKSPACE_RUNTIME_POLICY, "workspace_bash"),
		false,
	);
});

test("enables built-in read tools plus both held-write classes and disables every other mutation-shaped capability", () => {
	const expectedCapabilityIds = [
		"builtin_read_tools",
		"workspace_bash",
		"workspace_mutations",
		"mcp_tools",
		"connected_account_tools",
		"external_mutations",
		"memory_writes",
		"artifact_publishing",
	];
	const expectedEnabledCapabilityIds = [
		"builtin_read_tools",
		"memory_writes",
		"external_mutations",
	];
	const expectedDisabledCapabilityIds = expectedCapabilityIds.filter(
		(id) => !expectedEnabledCapabilityIds.includes(id),
	);

	assert.deepEqual([...THINKSPACE_RUNTIME_CAPABILITY_IDS], expectedCapabilityIds);
	assert.deepEqual([...THINKSPACE_RUNTIME_ENABLED_CAPABILITY_IDS], expectedEnabledCapabilityIds);
	assert.deepEqual([...THINKSPACE_RUNTIME_DISABLED_CAPABILITY_IDS], expectedDisabledCapabilityIds);
	assert.equal(THINKSPACE_RUNTIME_POLICY.capabilities.length, expectedCapabilityIds.length);

	// The two held-write classes — internal (Memory) and external (Connected
	// Account mutations) — are the only mutation-shaped capabilities enabled;
	// `connected_account_tools` stays reserved/disabled (PRD #92, #93, #108).
	assert.equal(THINKSPACE_RUNTIME_HELD_WRITE_CAPABILITY_ID, "memory_writes");
	assert.equal(THINKSPACE_RUNTIME_HELD_EXTERNAL_WRITE_CAPABILITY_ID, "external_mutations");

	for (const capability of THINKSPACE_RUNTIME_POLICY.capabilities) {
		const expectedEnabled = expectedEnabledCapabilityIds.includes(capability.id);

		assert.equal(
			capability.enabled,
			expectedEnabled,
			`${capability.id} must be ${expectedEnabled ? "enabled" : "disabled"}`,
		);
		assert.equal(
			isThinkspaceRuntimeCapabilityEnabled(THINKSPACE_RUNTIME_POLICY, capability.id),
			expectedEnabled,
		);
	}
});

test("declares the governed-writes runtime mode with bounded step counts", () => {
	assert.equal(THINKSPACE_RUNTIME_POLICY.mode, "governed_writes");
	assert.equal(THINKSPACE_RUNTIME_POLICY.policyId, "governed_tools_v4");
	assert.equal(THINKSPACE_RUNTIME_POLICY.workspaceBash, false);
	assert.equal(THINKSPACE_RUNTIME_POLICY.maxSteps, 1);
});

test("creates an empty runtime toolset", () => {
	assert.deepEqual(createThinkspaceRuntimeToolSet(), {});
	assert.deepEqual(Object.keys(createThinkspaceRuntimeToolSet()), []);
});

test("creates a turn config with no active tools and the policy step bound", () => {
	const turnConfig = createThinkspaceRuntimeTurnConfig();

	assert.deepEqual(turnConfig.activeTools, []);
	assert.equal(turnConfig.maxSteps, THINKSPACE_RUNTIME_POLICY.maxSteps);
});

test("raises the per-turn step bound only when runtime tools are active", () => {
	const turnConfig = createThinkspaceRuntimeTurnConfig({
		activeTools: ["tool_cloudflaredocs_search_docs"],
	});

	assert.deepEqual(turnConfig.activeTools, ["tool_cloudflaredocs_search_docs"]);
	assert.equal(turnConfig.maxSteps, 8);
});

test("reports the runtime policy only after Thinkspace ownership is confirmed", async () => {
	const requestedOwnershipChecks: { ownerUserId: string; thinkspaceId: string }[] = [];
	const getThinkspaceByOwner = (
		_db: ProductDb,
		input: { ownerUserId: string; thinkspaceId: string },
	) => {
		requestedOwnershipChecks.push(input);

		if (input.ownerUserId !== "owner_user") {
			return Promise.resolve(null);
		}

		return Promise.resolve({ id: input.thinkspaceId });
	};

	const ownerPolicy = await getOwnedThinkspaceRuntimePolicy({
		db: {} as ProductDb,
		getThinkspaceByOwner,
		ownerUserId: "owner_user",
		thinkspaceId: "thinkspace_owned",
	});
	const nonOwnerPolicy = await getOwnedThinkspaceRuntimePolicy({
		db: {} as ProductDb,
		getThinkspaceByOwner,
		ownerUserId: "other_user",
		thinkspaceId: "thinkspace_owned",
	});

	assert.equal(ownerPolicy?.thinkspaceId, "thinkspace_owned");
	assert.equal(ownerPolicy?.policyId, "governed_tools_v4");
	assert.equal(ownerPolicy?.workspaceBash, false);
	assert.equal(nonOwnerPolicy, null);
	assert.deepEqual(requestedOwnershipChecks, [
		{ ownerUserId: "owner_user", thinkspaceId: "thinkspace_owned" },
		{ ownerUserId: "other_user", thinkspaceId: "thinkspace_owned" },
	]);
});
