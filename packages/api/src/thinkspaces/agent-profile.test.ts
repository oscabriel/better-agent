import assert from "node:assert/strict";
import test from "node:test";

import type { ThinkspaceAgentProfile } from "@better-agent/db/schema/agent-profiles";

import { getModelDefinition } from "../models/catalog";
import { ModelCatalogError } from "../models/model-catalog";
import {
	AgentProfileValidationError,
	parseAgentProfileRevision,
	serializeAgentProfileRevision,
	validateAgentProfileIdentity,
	validateAgentProfileModelBehavior,
	validateRoutine,
} from "./agent-profile";

const REASONING_MODEL_ID = "google:gemini-2.5-flash-lite";
const NON_REASONING_MODEL_ID = "openai:gpt-4o-mini";
const NOW = new Date("2026-06-10T12:00:00.000Z");

const createRow = (overrides: Partial<ThinkspaceAgentProfile> = {}): ThinkspaceAgentProfile => ({
	activatedAt: null,
	createdAt: NOW,
	displayName: "Release Monitor",
	id: "rev_1",
	instructions: "Watch SDK releases.",
	modelId: REASONING_MODEL_ID,
	reasoningLevel: "medium",
	requestedPermissions: "[]",
	routines: "[]",
	skillReferences: "[]",
	status: "draft",
	supersededAt: null,
	thinkspaceId: "thinkspace_1",
	toolEnablements: "[]",
	updatedAt: NOW,
	version: 1,
	...overrides,
});

test("identity validation trims and bounds the displayed pieces", () => {
	const identity = validateAgentProfileIdentity({
		displayName: "  Release Monitor  ",
		instructions: " Watch SDK releases. ",
	});

	assert.deepEqual(identity, {
		displayName: "Release Monitor",
		instructions: "Watch SDK releases.",
	});
	assert.throws(
		() => validateAgentProfileIdentity({ displayName: "  ", instructions: "" }),
		AgentProfileValidationError,
	);
});

test("model behavior pairs a catalog model with a compatible reasoning level", () => {
	const behavior = validateAgentProfileModelBehavior({
		catalogEntry: getModelDefinition(REASONING_MODEL_ID),
		modelId: REASONING_MODEL_ID,
		reasoningLevel: "high",
	});

	assert.deepEqual(behavior, { modelId: REASONING_MODEL_ID, reasoningLevel: "high" });
});

test("model behavior rejects unknown models and incompatible reasoning levels", () => {
	assert.throws(
		() =>
			validateAgentProfileModelBehavior({
				catalogEntry: null,
				modelId: "openai:made-up",
				reasoningLevel: "low",
			}),
		ModelCatalogError,
	);
	assert.throws(
		() =>
			validateAgentProfileModelBehavior({
				catalogEntry: getModelDefinition(NON_REASONING_MODEL_ID),
				modelId: NON_REASONING_MODEL_ID,
				reasoningLevel: "high",
			}),
		AgentProfileValidationError,
	);
	assert.throws(
		() =>
			validateAgentProfileModelBehavior({
				catalogEntry: getModelDefinition(REASONING_MODEL_ID),
				modelId: REASONING_MODEL_ID,
				reasoningLevel: "none",
			}),
		AgentProfileValidationError,
	);
	assert.throws(
		() =>
			validateAgentProfileModelBehavior({
				catalogEntry: getModelDefinition(REASONING_MODEL_ID),
				modelId: REASONING_MODEL_ID,
				reasoningLevel: "temperature",
			}),
		AgentProfileValidationError,
	);
});

test("routine validation requires identity, instruction, and a usable schedule", () => {
	const routine = validateRoutine({
		instruction: " Check for new releases and draft notes. ",
		name: " Weekly release check ",
		routineId: "routine_1",
		schedule: { description: " every Monday morning ", kind: "natural_language" },
	});

	assert.deepEqual(routine, {
		instruction: "Check for new releases and draft notes.",
		name: "Weekly release check",
		routineId: "routine_1",
		schedule: { description: "every Monday morning", kind: "natural_language" },
	});
	assert.throws(
		() =>
			validateRoutine({
				instruction: "Check releases.",
				name: "Weekly",
				routineId: "routine_1",
				schedule: { expression: "  ", kind: "cron" },
			}),
		AgentProfileValidationError,
	);
});

test("rows round-trip through parse and serialize", () => {
	const row = createRow({
		routines:
			'[{"instruction":"Check releases.","name":"Weekly","routineId":"routine_1","schedule":{"expression":"0 9 * * 1","kind":"cron"}}]',
		toolEnablements: '[{"source":"built_in","toolId":"web_search"}]',
	});
	const revision = parseAgentProfileRevision(row);
	const serialized = serializeAgentProfileRevision(revision);

	assert.equal(revision.status, "draft");
	assert.equal(serialized.id, row.id);
	assert.deepEqual(
		parseAgentProfileRevision({ ...row, ...serialized } as ThinkspaceAgentProfile),
		revision,
	);
});

test("corrupt stored payloads fail with typed validation errors", () => {
	assert.throws(
		() => parseAgentProfileRevision(createRow({ routines: "not json" })),
		AgentProfileValidationError,
	);
	assert.throws(
		() => parseAgentProfileRevision(createRow({ toolEnablements: '[{"toolId":""}]' })),
		AgentProfileValidationError,
	);
	assert.throws(
		() => parseAgentProfileRevision(createRow({ reasoningLevel: "temperature" })),
		AgentProfileValidationError,
	);
	assert.throws(
		() => parseAgentProfileRevision(createRow({ status: "active" })),
		AgentProfileValidationError,
	);
	assert.throws(
		() => parseAgentProfileRevision(createRow({ status: "mystery" })),
		AgentProfileValidationError,
	);
});
