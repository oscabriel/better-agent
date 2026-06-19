import assert from "node:assert/strict";
import test from "node:test";

import {
	assertThinkspaceRuntimePolicySupportsExternalMutationTools,
	EXTERNAL_MUTATION_TOOL_IDS,
	externalMutationToolRuntimeCapabilityId,
	isExternalMutationToolId,
} from "./connected-account-runtime-tools";
import { THINKSPACE_RUNTIME_POLICY } from "./runtime-policy";

test("recognizes only the catalog-keyed external-mutation tool ids", () => {
	assert.deepEqual([...EXTERNAL_MUTATION_TOOL_IDS], ["github:create_issue"]);

	assert.equal(isExternalMutationToolId("github:create_issue"), true);

	// The bare runtime name, the catalog id alone, a read tool, an MCP tool, and
	// the empty string are all rejected — matching happens on the product id.
	assert.equal(isExternalMutationToolId("create_github_issue"), false);
	assert.equal(isExternalMutationToolId("github"), false);
	assert.equal(isExternalMutationToolId("memory_write"), false);
	assert.equal(isExternalMutationToolId("cloudflare-docs:search_docs"), false);
	assert.equal(isExternalMutationToolId(""), false);
});

test("maps every external-mutation tool to the held-external-write capability", () => {
	assert.equal(
		externalMutationToolRuntimeCapabilityId("github:create_issue"),
		"external_mutations",
	);
});

test("the policy guard passes for the shipped policy with the external-mutation tool active", () => {
	assert.doesNotThrow(() =>
		assertThinkspaceRuntimePolicySupportsExternalMutationTools({
			activeProductToolIds: ["github:create_issue"],
		}),
	);
});

test("the policy guard is a no-op for revisions with no potent external-mutation tool", () => {
	// Read-only and memory-only turns: the guard never sees an external-mutation
	// tool, so assembly output is untouched even when the capability is enabled.
	assert.doesNotThrow(() =>
		assertThinkspaceRuntimePolicySupportsExternalMutationTools({
			activeProductToolIds: ["web_search", "source_read", "memory_write"],
		}),
	);
	assert.doesNotThrow(() =>
		assertThinkspaceRuntimePolicySupportsExternalMutationTools({
			activeProductToolIds: [],
		}),
	);
});

test("the policy guard gates external mutations on the held-external-write capability", () => {
	// A policy with held external writes disabled must reject an assembled
	// external-mutation tool while still admitting non-external tools.
	const noExternalWritesPolicy = {
		...THINKSPACE_RUNTIME_POLICY,
		capabilities: THINKSPACE_RUNTIME_POLICY.capabilities.map((capability) =>
			capability.id === "external_mutations" ? { ...capability, enabled: false } : capability,
		),
	};

	assert.throws(
		() =>
			assertThinkspaceRuntimePolicySupportsExternalMutationTools({
				activeProductToolIds: ["github:create_issue"],
				policy: noExternalWritesPolicy,
			}),
		/thinkspace-turn-product-safe:.*runtime safety policy/u,
	);

	assert.doesNotThrow(() =>
		assertThinkspaceRuntimePolicySupportsExternalMutationTools({
			activeProductToolIds: ["web_search"],
			policy: noExternalWritesPolicy,
		}),
	);
});

test("the policy guard fails closed if workspace bash is ever not forced off", () => {
	const bashPolicy = {
		...THINKSPACE_RUNTIME_POLICY,
		workspaceBash: true as unknown as false,
	};

	assert.throws(
		() =>
			assertThinkspaceRuntimePolicySupportsExternalMutationTools({
				activeProductToolIds: [],
				policy: bashPolicy,
			}),
		/thinkspace-turn-product-safe:/u,
	);
});
