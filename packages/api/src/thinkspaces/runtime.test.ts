import assert from "node:assert/strict";
import test from "node:test";

import type { ProductDb } from "@better-agent/db";
import type { CloudflareEnv } from "@better-agent/env/types";

import {
	getOwnedThinkspaceAgentRuntimeReadiness,
	getThinkspaceAgentRuntimeName,
	resolveThinkspaceAgentRuntime,
	ThinkspaceRuntimeResolutionError,
} from "./runtime";

const createRuntimeEnv = (): Pick<CloudflareEnv, "THINKSPACE_AGENT"> => ({
	THINKSPACE_AGENT: {
		idFromName: (name: string) =>
			({
				toString: () => `durable-object-id:${name}`,
			}) as DurableObjectId,
	} as DurableObjectNamespace,
});

test("derives stable Thinkspace Agent runtime identity from the Thinkspace id", () => {
	const env = createRuntimeEnv();

	const first = resolveThinkspaceAgentRuntime({ env, thinkspaceId: "thinkspace_123" });
	const retry = resolveThinkspaceAgentRuntime({ env, thinkspaceId: "thinkspace_123" });
	const differentThinkspace = resolveThinkspaceAgentRuntime({
		env,
		thinkspaceId: "thinkspace_456",
	});

	assert.equal(first.runtimeName, "thinkspace_123");
	assert.equal(first.runtimeId, retry.runtimeId);
	assert.notEqual(first.runtimeId, differentThinkspace.runtimeId);
	assert.equal(first.bindingName, "THINKSPACE_AGENT");
	assert.equal(first.className, "ThinkspaceAgent");
	assert.equal(first.status, "ready");
});

test("rejects blank Thinkspace Agent runtime identities", () => {
	assert.throws(() => getThinkspaceAgentRuntimeName("   "), ThinkspaceRuntimeResolutionError);
});

test("requires the runtime Durable Object binding before reporting readiness", () => {
	assert.throws(
		() =>
			resolveThinkspaceAgentRuntime({
				env: {} as Pick<CloudflareEnv, "THINKSPACE_AGENT">,
				thinkspaceId: "thinkspace_123",
			}),
		ThinkspaceRuntimeResolutionError,
	);
});

test("reports readiness only after Thinkspace ownership is confirmed", async () => {
	const env = createRuntimeEnv();
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

	const ownerReadiness = await getOwnedThinkspaceAgentRuntimeReadiness({
		db: {} as ProductDb,
		env,
		getThinkspaceByOwner,
		ownerUserId: "owner_user",
		thinkspaceId: "thinkspace_owned",
	});
	const nonOwnerReadiness = await getOwnedThinkspaceAgentRuntimeReadiness({
		db: {} as ProductDb,
		env,
		getThinkspaceByOwner,
		ownerUserId: "other_user",
		thinkspaceId: "thinkspace_owned",
	});

	assert.equal(ownerReadiness?.runtimeName, "thinkspace_owned");
	assert.equal(nonOwnerReadiness, null);
	assert.deepEqual(requestedOwnershipChecks, [
		{ ownerUserId: "owner_user", thinkspaceId: "thinkspace_owned" },
		{ ownerUserId: "other_user", thinkspaceId: "thinkspace_owned" },
	]);
});
