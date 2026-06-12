import assert from "node:assert/strict";
import test from "node:test";

import type { ActiveAgentProfileRevision } from "./agent-profile";
import {
	createEnablementOnlyPermissionPolicy,
	createMemoryPermissionPolicy,
} from "./permission-policy";
import { THINKSPACE_RUNTIME_MAX_STEPS } from "./runtime-policy";
import { assembleThinkspaceTurn } from "./turn-assembly";

const NOW = new Date("2026-06-10T12:00:00.000Z");

const REVISION: ActiveAgentProfileRevision = {
	activatedAt: NOW,
	createdAt: NOW,
	id: "rev_2",
	identity: { displayName: "Release Monitor", instructions: "Watch SDK releases." },
	modelBehavior: { modelId: "google:gemini-2.5-flash-lite", reasoningLevel: "medium" },
	routines: [],
	skillReferences: [],
	status: "active",
	thinkspaceId: "thinkspace_1",
	toolEnablements: [
		{ source: "built_in", toolId: "web_search" },
		{ source: "connected_account", toolId: "github_create_issue" },
	],
	updatedAt: NOW,
	version: 2,
};

test("assembly with no grants activates nothing: built-ins are no longer potent on enablement alone", async () => {
	const verdicts = await createEnablementOnlyPermissionPolicy().evaluateToolPotency({
		enablements: REVISION.toolEnablements,
		thinkspaceId: REVISION.thinkspaceId,
	});
	const assembly = assembleThinkspaceTurn({ revision: REVISION, toolPotencies: verdicts });

	assert.deepEqual(assembly.activeTools, []);
	assert.equal(assembly.maxSteps, THINKSPACE_RUNTIME_MAX_STEPS);
	assert.equal(assembly.profileRevisionId, "rev_2");
	assert.equal(assembly.profileVersion, 2);
	assert.deepEqual(assembly.modelSelection, {
		modelId: "google:gemini-2.5-flash-lite",
		reasoningLevel: "medium",
	});
	assert.match(assembly.systemPrompt, /Release Monitor/u);
	assert.match(assembly.systemPrompt, /Watch SDK releases\./u);
});

test("potency can never add a tool the Profile did not make present", async () => {
	const verdicts = await createMemoryPermissionPolicy({
		github_create_issue: "potent",
		not_enabled_tool: "potent",
	}).evaluateToolPotency({
		enablements: REVISION.toolEnablements,
		thinkspaceId: REVISION.thinkspaceId,
	});
	const assembly = assembleThinkspaceTurn({ revision: REVISION, toolPotencies: verdicts });

	assert.deepEqual(assembly.activeTools, ["github_create_issue"]);
});

test("enabled tools without a potency verdict stay inert", () => {
	const assembly = assembleThinkspaceTurn({ revision: REVISION, toolPotencies: [] });

	assert.deepEqual(assembly.activeTools, []);
});
