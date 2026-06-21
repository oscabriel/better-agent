import assert from "node:assert/strict";
import test from "node:test";

import type { ProductDb } from "@better-agent/db";
import { user } from "@better-agent/db/schema/auth";
import type { Tool, ToolCallOptions } from "ai";

import { DEFAULT_MODEL_ID, getModelCatalog } from "../models/catalog";
import { createMemoryModelCatalog } from "../models/model-catalog";
import type { ModelCatalog } from "../models/model-catalog";
import { createTestProductDb } from "../testing/product-db";
import {
	getSeedReasoningLevel,
	validateAgentProfileIdentity,
	validateAgentProfileModelBehavior,
} from "./agent-profile";
import { createInitialAgentProfileDraft } from "./agent-profile-lifecycle";
import { getDraftAgentProfileRevision } from "./agent-profile-repository";
import { buildCuratorCardProjection } from "./curator-card";
import type { CuratorCardConnectedAccountRecord } from "./curator-card";
import { createCuratorRuntimeTools } from "./curator-runtime-tools";
import { createCurationDraftThinkspaceRecord } from "./lifecycle";
import { createThinkspaceWithAgentProfileDraft, getThinkspace } from "./repository";
import { toRequestedPermissions } from "./tool-selection";

const OWNER_ID = "curator_card_owner";
const DRAFT_ID = "thinkspace_curator_card_draft";
const TOOL_CALL_OPTIONS = { messages: [], toolCallId: "tool_call_1" } as ToolCallOptions;
const modelCatalog: ModelCatalog = createMemoryModelCatalog([...getModelCatalog()]);

const executeTool = async (toolDefinition: Tool | undefined, input: unknown): Promise<string> => {
	assert.ok(toolDefinition?.execute, "tool must be constructed with an execute handler");

	return (await toolDefinition.execute(input as never, TOOL_CALL_OPTIONS)) as string;
};

/**
 * Seeds the (DRAFT Thinkspace + initial empty-Goal Agent Profile draft) pair
 * `startCuration` mints, so the Curator tools — and the projection they drive —
 * run against a faithful draft.
 */
const seedCurationDraft = async (db: ProductDb): Promise<void> => {
	await db.insert(user).values({ email: `${OWNER_ID}@example.com`, id: OWNER_ID, name: "Owner" });

	const record = createCurationDraftThinkspaceRecord({ id: DRAFT_ID, ownerUserId: OWNER_ID });
	const identity = validateAgentProfileIdentity({
		displayName: "Untitled Thinkspace",
		instructions: "",
	});
	const entry = await modelCatalog.getModel(DEFAULT_MODEL_ID);
	assert.ok(entry, "seed model must exist in the catalog");
	const modelBehavior = validateAgentProfileModelBehavior({
		catalogEntry: entry,
		modelId: DEFAULT_MODEL_ID,
		reasoningLevel: getSeedReasoningLevel({
			catalogEntryReasoning: entry.reasoning,
			reasoningEffort: "medium",
		}),
	});
	const draft = createInitialAgentProfileDraft({
		id: `agent_profile_revision_${crypto.randomUUID()}`,
		identity,
		modelBehavior,
		requestedPermissions: toRequestedPermissions(modelBehavior.modelId, [], [], []),
		thinkspaceId: DRAFT_ID,
	});
	await createThinkspaceWithAgentProfileDraft(db, { draft, record });
};

const boundTools = (db: ProductDb) =>
	createCuratorRuntimeTools({
		resolveContext: () =>
			Promise.resolve({ db, draftThinkspaceId: DRAFT_ID, modelCatalog, ownerUserId: OWNER_ID }),
	});

const projectCard = async (
	db: ProductDb,
	connectedAccounts: readonly CuratorCardConnectedAccountRecord[] = [],
) => {
	const draft = await getDraftAgentProfileRevision(db, { thinkspaceId: DRAFT_ID });
	assert.ok(draft, "the seeded draft must still exist");
	const thinkspace = await getThinkspace(db, { ownerUserId: OWNER_ID, thinkspaceId: DRAFT_ID });
	assert.ok(thinkspace, "the seeded Thinkspace must still exist");

	return buildCuratorCardProjection({
		connectedAccounts,
		defaultModelId: DEFAULT_MODEL_ID,
		draft,
		thinkspace,
	});
};

test("projects a set_goal + enable_tool sequence including a not-connected connected-account tool", async () => {
	const db = createTestProductDb();
	await seedCurationDraft(db);
	const tools = boundTools(db);

	await executeTool(tools.set_goal, { goal: "Triage GitHub issues weekly" });
	await executeTool(tools.enable_tool, { toolId: "web_search" });
	await executeTool(tools.enable_tool, { toolId: "github:create_issue" });

	// No Connected Account exists for the owner, so the proposed GitHub tool is
	// surfaced as not-connected.
	const card = await projectCard(db, []);

	// The Goal flows to the card, and the display name tracks it (no naming tool).
	assert.equal(card.goal, "Triage GitHub issues weekly");
	assert.equal(card.displayName, "Triage GitHub issues weekly");

	// The model is still the inherited default — the Curator never ran set_model.
	assert.equal(card.model.modelId, DEFAULT_MODEL_ID);
	assert.equal(card.model.provenance, "inherited_default");

	// Both enabled tools need a Permission (no tool is potent on enablement alone).
	assert.deepEqual(
		card.tools.toSorted((a, b) => a.toolId.localeCompare(b.toolId)),
		[
			{ badge: "needs_permission", source: "connected_account", toolId: "github:create_issue" },
			{ badge: "needs_permission", source: "built_in", toolId: "web_search" },
		],
	);

	// The requested Permissions mirror what activation will ask the owner to grant.
	assert.deepEqual(card.requestedPermissions.map((permission) => permission.kind).toSorted(), [
		"built_in_web_read",
		"connected_account_credential",
		"model_provider_credential",
	]);

	// The Connected Accounts section shows GitHub as backing the proposed tool and
	// not yet connected.
	assert.deepEqual(card.connectedAccounts, [
		{ accountLabel: null, catalogId: "github", connected: false, toolId: "github:create_issue" },
	]);

	// A real Goal plus the always-seeded model-credential request makes it ready.
	assert.equal(card.ready, true);
});

test("a fresh draft projects an unready empty card on the inherited default model", async () => {
	const db = createTestProductDb();
	await seedCurationDraft(db);

	const card = await projectCard(db, []);

	assert.equal(card.goal, "");
	assert.equal(card.displayName, "Untitled Thinkspace");
	assert.equal(card.ready, false);
	assert.deepEqual(card.tools, []);
	assert.deepEqual(card.connectedAccounts, []);
	// Even an empty draft carries the model-credential request, so readiness turns
	// solely on the Goal here.
	assert.deepEqual(
		card.requestedPermissions.map((permission) => permission.kind),
		["model_provider_credential"],
	);
});

test("a connected backing account is surfaced as connected with its label", async () => {
	const db = createTestProductDb();
	await seedCurationDraft(db);
	const tools = boundTools(db);

	await executeTool(tools.set_goal, { goal: "Open issues from triage notes" });
	await executeTool(tools.enable_tool, { toolId: "github:create_issue" });

	const card = await projectCard(db, [
		{ catalogId: "github", externalAccountId: "octocat", label: "Octocat (PAT)" },
	]);

	assert.deepEqual(card.connectedAccounts, [
		{
			accountLabel: "Octocat (PAT)",
			catalogId: "github",
			connected: true,
			toolId: "github:create_issue",
		},
	]);
});

test("set_model flips model provenance to curator-set and reasoning level follows", async () => {
	const db = createTestProductDb();
	await seedCurationDraft(db);
	const tools = boundTools(db);

	await executeTool(tools.set_model, { modelId: "openai:gpt-4o-mini" });

	const card = await projectCard(db, []);

	assert.equal(card.model.modelId, "openai:gpt-4o-mini");
	assert.equal(card.model.provenance, "curator_set");
	assert.equal(card.model.reasoningLevel, "none");
});
