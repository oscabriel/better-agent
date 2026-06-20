import assert from "node:assert/strict";
import test from "node:test";

import type { ProductDb } from "@better-agent/db";
import type { CloudflareEnv } from "@better-agent/env/types";

import {
	CURATOR_AGENT_BINDING_NAME,
	CURATOR_AGENT_CLASS_NAME,
	CuratorRuntimeResolutionError,
	getCuratorAgentRuntimeName,
	getOwnedCuratorAgentRuntimeReadiness,
	resolveCuratorAgentRuntime,
} from "./runtime";

const db = {} as ProductDb;

/** A binding stub whose id is a deterministic function of the runtime name. */
const createEnv = (): Pick<CloudflareEnv, typeof CURATOR_AGENT_BINDING_NAME> =>
	({
		CURATOR_AGENT: {
			idFromName: (name: string) => ({ toString: () => `do_${name}` }),
		},
	}) as unknown as Pick<CloudflareEnv, typeof CURATOR_AGENT_BINDING_NAME>;

test("the runtime is keyed on the draft Thinkspace id", () => {
	assert.equal(getCuratorAgentRuntimeName("  thinkspace_123  "), "thinkspace_123");
	assert.throws(() => getCuratorAgentRuntimeName("   "), CuratorRuntimeResolutionError);
});

test("resolves a Curator runtime identity bound to the draft id", () => {
	const readiness = resolveCuratorAgentRuntime({
		draftThinkspaceId: "thinkspace_123",
		env: createEnv(),
	});

	assert.equal(readiness.bindingName, CURATOR_AGENT_BINDING_NAME);
	assert.equal(readiness.className, CURATOR_AGENT_CLASS_NAME);
	assert.equal(readiness.runtimeName, "thinkspace_123");
	assert.equal(readiness.runtimeId, "do_thinkspace_123");
	assert.equal(readiness.status, "ready");
});

test("owner-gated readiness resolves for a draft the caller owns", async () => {
	const readiness = await getOwnedCuratorAgentRuntimeReadiness({
		db,
		draftThinkspaceId: "thinkspace_owned",
		env: createEnv(),
		getThinkspaceByOwner: (_db, input) => {
			assert.equal(input.ownerUserId, "owner_user");
			assert.equal(input.thinkspaceId, "thinkspace_owned");
			return Promise.resolve({ id: "thinkspace_owned" });
		},
		ownerUserId: "owner_user",
	});

	assert.equal(readiness?.runtimeName, "thinkspace_owned");
	assert.equal(readiness?.status, "ready");
});

test("owner-gated readiness is null for a non-owner or missing draft", async () => {
	const readiness = await getOwnedCuratorAgentRuntimeReadiness({
		db,
		draftThinkspaceId: "thinkspace_owned",
		env: createEnv(),
		// A non-owner and a non-existent draft are indistinguishable — both null.
		getThinkspaceByOwner: () => Promise.resolve(null),
		ownerUserId: "other_user",
	});

	assert.equal(readiness, null);
});
