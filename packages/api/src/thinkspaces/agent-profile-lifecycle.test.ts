import assert from "node:assert/strict";
import test from "node:test";

import { THINKSPACE_STATUS } from "@better-agent/db/schema/thinkspaces";

import type { AgentProfileModelBehavior } from "./agent-profile";
import {
	AgentProfileLifecycleError,
	createAgentProfileActivation,
	createAgentProfileDraftFromActive,
	createInitialAgentProfileDraft,
	FIRST_AGENT_PROFILE_VERSION,
} from "./agent-profile-lifecycle";

const NOW = new Date("2026-06-10T12:00:00.000Z");
const LATER = new Date("2026-06-10T13:00:00.000Z");

const MODEL_BEHAVIOR: AgentProfileModelBehavior = {
	modelId: "google:gemini-2.5-flash-lite",
	reasoningLevel: "medium",
};

const createDraft = () =>
	createInitialAgentProfileDraft({
		id: "rev_1",
		identity: { displayName: "Release Monitor", instructions: "Watch SDK releases." },
		modelBehavior: MODEL_BEHAVIOR,
		now: NOW,
		thinkspaceId: "thinkspace_1",
	});

test("an initial draft starts at version 1 with draft status", () => {
	const draft = createDraft();

	assert.equal(draft.status, "draft");
	assert.equal(draft.version, FIRST_AGENT_PROFILE_VERSION);
	assert.deepEqual(draft.requestedPermissions, []);
});

test("first activation of a draft Thinkspace activates revision and Thinkspace together", () => {
	const activation = createAgentProfileActivation({
		currentActive: null,
		draft: createDraft(),
		now: LATER,
		thinkspace: { id: "thinkspace_1", status: THINKSPACE_STATUS.DRAFT },
	});

	assert.equal(activation.activatedRevision.status, "active");
	assert.equal(activation.activatedRevision.activatedAt, LATER);
	assert.equal(activation.supersededRevision, null);
	assert.deepEqual(activation.thinkspaceActivationPatch, {
		status: THINKSPACE_STATUS.ACTIVE,
		updatedAt: LATER,
	});
});

test("activating a newer draft supersedes the active revision", () => {
	const first = createAgentProfileActivation({
		currentActive: null,
		draft: createDraft(),
		now: LATER,
		thinkspace: { id: "thinkspace_1", status: THINKSPACE_STATUS.DRAFT },
	});
	const nextDraft = createAgentProfileDraftFromActive({
		active: first.activatedRevision,
		id: "rev_2",
		now: LATER,
	});

	assert.equal(nextDraft.version, 2);

	const second = createAgentProfileActivation({
		currentActive: first.activatedRevision,
		draft: nextDraft,
		now: LATER,
		thinkspace: { id: "thinkspace_1", status: THINKSPACE_STATUS.ACTIVE },
	});

	assert.equal(second.supersededRevision?.id, "rev_1");
	assert.equal(second.supersededRevision?.status, "superseded");
	assert.equal(second.activatedRevision.id, "rev_2");
	assert.equal(second.thinkspaceActivationPatch, null);
});

test("archived Thinkspaces reject Agent Profile activation", () => {
	assert.throws(
		() =>
			createAgentProfileActivation({
				currentActive: null,
				draft: createDraft(),
				thinkspace: { id: "thinkspace_1", status: THINKSPACE_STATUS.ARCHIVED },
			}),
		AgentProfileLifecycleError,
	);
});

test("a draft cannot activate against an equal-or-newer active revision", () => {
	const activation = createAgentProfileActivation({
		currentActive: null,
		draft: createDraft(),
		now: LATER,
		thinkspace: { id: "thinkspace_1", status: THINKSPACE_STATUS.DRAFT },
	});

	assert.throws(
		() =>
			createAgentProfileActivation({
				currentActive: activation.activatedRevision,
				draft: createDraft(),
				thinkspace: { id: "thinkspace_1", status: THINKSPACE_STATUS.ACTIVE },
			}),
		AgentProfileLifecycleError,
	);
});

test("a draft only activates for its own Thinkspace", () => {
	assert.throws(
		() =>
			createAgentProfileActivation({
				currentActive: null,
				draft: createDraft(),
				thinkspace: { id: "thinkspace_other", status: THINKSPACE_STATUS.DRAFT },
			}),
		AgentProfileLifecycleError,
	);
});

test("requested Permissions never carry past activation", () => {
	const draft = {
		...createDraft(),
		requestedPermissions: [
			{
				kind: "model_provider_credential" as const,
				providerId: "anthropic" as const,
				reason: "Use the saved Anthropic credential for this Thinkspace.",
			},
		],
	};

	const activation = createAgentProfileActivation({
		currentActive: null,
		draft,
		thinkspace: { id: "thinkspace_1", status: THINKSPACE_STATUS.DRAFT },
	});

	assert.equal("requestedPermissions" in activation.activatedRevision, false);
});
