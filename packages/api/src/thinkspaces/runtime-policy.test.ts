import assert from "node:assert/strict";
import test from "node:test";

import type { ProductDb } from "@better-agent/db";

import {
	createThinkspaceRuntimeToolSet,
	createThinkspaceRuntimeTurnConfig,
	getOwnedThinkspaceRuntimePolicy,
	isThinkspaceRuntimeCapabilityEnabled,
	THINKSPACE_RUNTIME_CAPABILITY_IDS,
	THINKSPACE_RUNTIME_POLICY,
} from "./runtime-policy";

test("disables workspace Bash for the first Thinkspace Agent runtime", () => {
	assert.equal(THINKSPACE_RUNTIME_POLICY.workspaceBash, false);
	assert.equal(
		isThinkspaceRuntimeCapabilityEnabled(THINKSPACE_RUNTIME_POLICY, "workspace_bash"),
		false,
	);
});

test("disables every unsafe capability in the no-tools baseline", () => {
	const expectedCapabilityIds = [
		"workspace_bash",
		"workspace_mutations",
		"mcp_tools",
		"connected_account_tools",
		"external_mutations",
		"memory_writes",
		"artifact_publishing",
	];

	assert.deepEqual([...THINKSPACE_RUNTIME_CAPABILITY_IDS], expectedCapabilityIds);
	assert.equal(THINKSPACE_RUNTIME_POLICY.capabilities.length, expectedCapabilityIds.length);

	for (const capability of THINKSPACE_RUNTIME_POLICY.capabilities) {
		assert.equal(capability.enabled, false, `${capability.id} must be disabled`);
		assert.equal(
			isThinkspaceRuntimeCapabilityEnabled(THINKSPACE_RUNTIME_POLICY, capability.id),
			false,
		);
	}
});

test("declares a model-only runtime mode with a bounded step count", () => {
	assert.equal(THINKSPACE_RUNTIME_POLICY.mode, "model_only");
	assert.equal(THINKSPACE_RUNTIME_POLICY.policyId, "no_tools_v1");
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
	assert.equal(ownerPolicy?.policyId, "no_tools_v1");
	assert.equal(ownerPolicy?.workspaceBash, false);
	assert.equal(nonOwnerPolicy, null);
	assert.deepEqual(requestedOwnershipChecks, [
		{ ownerUserId: "owner_user", thinkspaceId: "thinkspace_owned" },
		{ ownerUserId: "other_user", thinkspaceId: "thinkspace_owned" },
	]);
});
