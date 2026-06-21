import assert from "node:assert/strict";
import test from "node:test";

import type { ProductDb } from "@better-agent/db";
import { user } from "@better-agent/db/schema/auth";
import { call } from "@orpc/server";
import type { Tool, ToolCallOptions } from "ai";

import type { Context } from "../context";
import { DEFAULT_MODEL_ID, getModelCatalog } from "../models/catalog";
import { createMemoryModelCatalog } from "../models/model-catalog";
import type { ModelCatalog } from "../models/model-catalog";
import { createTestProductDb } from "../testing/product-db";
import {
	getSeedReasoningLevel,
	validateAgentProfileIdentity,
	validateAgentProfileModelBehavior,
} from "./agent-profile";
import type { McpToolAccessPermissionRequest, RequestedPermission } from "./agent-profile";
import { getDraftAgentProfileRevision } from "./agent-profile-repository";
import { createInitialAgentProfileDraft } from "./agent-profile-lifecycle";
import { createCuratorRuntimeTools } from "./curator-runtime-tools";
import type {
	CuratorRuntimeToolContext,
	ResolveCuratorRuntimeToolContext,
} from "./curator-runtime-tools";
import { createCurationDraftThinkspaceRecord } from "./lifecycle";
import {
	createThinkspaceWithAgentProfileDraft,
	getThinkspace,
	listThinkspaces,
} from "./repository";
import { thinkspacesRouter } from "./router";
import { toRequestedPermissions } from "./tool-selection";

const OWNER_ID = "curator_owner";
const DRAFT_ID = "thinkspace_curation_draft";
const TOOL_CALL_OPTIONS = { messages: [], toolCallId: "tool_call_1" } as ToolCallOptions;
const modelCatalog: ModelCatalog = createMemoryModelCatalog([...getModelCatalog()]);

const executeTool = async (toolDefinition: Tool | undefined, input: unknown): Promise<string> => {
	assert.ok(toolDefinition?.execute, "tool must be constructed with an execute handler");

	return (await toolDefinition.execute(input as never, TOOL_CALL_OPTIONS)) as string;
};

/**
 * Seeds the exact (DRAFT Thinkspace + initial empty-Goal Agent Profile draft)
 * pair `startCuration` mints, so the Curator tools run against a faithful draft.
 */
const seedCurationDraft = async (
	db: ProductDb,
	{
		ownerUserId = OWNER_ID,
		thinkspaceId = DRAFT_ID,
	}: { ownerUserId?: string; thinkspaceId?: string } = {},
): Promise<void> => {
	await db
		.insert(user)
		.values({ email: `${ownerUserId}@example.com`, id: ownerUserId, name: "Owner" });

	const record = createCurationDraftThinkspaceRecord({ id: thinkspaceId, ownerUserId });
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
		thinkspaceId,
	});
	await createThinkspaceWithAgentProfileDraft(db, { draft, record });
};

const boundContext = (db: ProductDb): CuratorRuntimeToolContext => ({
	db,
	draftThinkspaceId: DRAFT_ID,
	modelCatalog,
	ownerUserId: OWNER_ID,
});

const toolsFor = (resolveContext: ResolveCuratorRuntimeToolContext) =>
	createCuratorRuntimeTools({ resolveContext });

const boundToolsFor = (db: ProductDb) => toolsFor(() => Promise.resolve(boundContext(db)));

const readDraft = async (db: ProductDb) => {
	const draft = await getDraftAgentProfileRevision(db, { thinkspaceId: DRAFT_ID });
	assert.ok(draft, "the seeded draft must still exist");
	return draft;
};

const updateToolSelectionsContext = (db: ProductDb): Context =>
	({
		db,
		env: {},
		executionCtx: undefined,
		headers: new Headers(),
		modelCatalog,
		session: { session: { id: "session_1" }, user: { id: OWNER_ID } },
	}) as unknown as Context;

test("the Curator toolset is exactly the five propose-only tools — no activate, no grant", () => {
	const tools = createCuratorRuntimeTools({ resolveContext: () => Promise.resolve(null) });

	assert.equal("activate" in tools, false);
	assert.equal("grant" in tools, false);
	assert.deepEqual(Object.keys(tools).toSorted(), [
		"enable_tool",
		"set_configuration_summary",
		"set_goal",
		"set_instructions",
		"set_model",
	]);
});

test("a tool with no bound context changes nothing and returns a product-safe message", async () => {
	const db = createTestProductDb();
	await seedCurationDraft(db);
	const tools = toolsFor(() => Promise.resolve(null));

	const result = await executeTool(tools.set_goal, { goal: "Ship the curator slice" });

	assert.match(result, /draft Thinkspace/u);
	const thinkspace = await getThinkspace(db, { ownerUserId: OWNER_ID, thinkspaceId: DRAFT_ID });
	assert.equal(thinkspace?.goal, "");
});

test("set_goal gives the empty-Goal draft a real Goal and returns it to the owner's list", async () => {
	const db = createTestProductDb();
	await seedCurationDraft(db);
	const tools = boundToolsFor(db);

	const before = await listThinkspaces(db, { ownerUserId: OWNER_ID });
	assert.equal(before.length, 0);

	const result = await executeTool(tools.set_goal, { goal: "  Monitor SDK releases weekly  " });

	assert.match(result, /Monitor SDK releases weekly/u);
	const thinkspace = await getThinkspace(db, { ownerUserId: OWNER_ID, thinkspaceId: DRAFT_ID });
	assert.equal(thinkspace?.goal, "Monitor SDK releases weekly");
	// The agent's name tracks the Goal, replacing the placeholder.
	const draft = await readDraft(db);
	assert.equal(draft.identity.displayName, "Monitor SDK releases weekly");
	const after = await listThinkspaces(db, { ownerUserId: OWNER_ID });
	assert.equal(after.length, 1);
});

test("set_goal rejects an empty Goal without touching the draft", async () => {
	const db = createTestProductDb();
	await seedCurationDraft(db);
	const tools = boundToolsFor(db);

	const result = await executeTool(tools.set_goal, { goal: "   " });

	assert.match(result, /Goal is required/u);
	const thinkspace = await getThinkspace(db, { ownerUserId: OWNER_ID, thinkspaceId: DRAFT_ID });
	assert.equal(thinkspace?.goal, "");
	const draft = await readDraft(db);
	assert.equal(draft.identity.displayName, "Untitled Thinkspace");
});

test("set_configuration_summary writes the summary to the bound draft Thinkspace", async () => {
	const db = createTestProductDb();
	await seedCurationDraft(db);
	const tools = boundToolsFor(db);

	await executeTool(tools.set_configuration_summary, {
		summary: "Reads release notes, drafts a handoff.",
	});

	const thinkspace = await getThinkspace(db, { ownerUserId: OWNER_ID, thinkspaceId: DRAFT_ID });
	assert.equal(thinkspace?.configurationSummary, "Reads release notes, drafts a handoff.");
});

test("set_instructions updates the draft revision's instructions, leaving the name untouched", async () => {
	const db = createTestProductDb();
	await seedCurationDraft(db);
	const tools = boundToolsFor(db);

	await executeTool(tools.set_instructions, { instructions: "Always cite the source release." });

	const draft = await readDraft(db);
	assert.equal(draft.identity.instructions, "Always cite the source release.");
	assert.equal(draft.identity.displayName, "Untitled Thinkspace");
});

test("set_model rewrites the model and re-derives the model-provider credential request", async () => {
	const db = createTestProductDb();
	await seedCurationDraft(db);
	const tools = boundToolsFor(db);

	const result = await executeTool(tools.set_model, { modelId: "openai:gpt-4o-mini" });

	assert.match(result, /gpt-4o-mini/u);
	const draft = await readDraft(db);
	assert.deepEqual(draft.modelBehavior, { modelId: "openai:gpt-4o-mini", reasoningLevel: "none" });
	const credential = draft.requestedPermissions.find(
		(permission) => permission.kind === "model_provider_credential",
	);
	assert.equal(
		credential?.kind === "model_provider_credential" ? credential.providerId : null,
		"openai",
	);
});

test("set_model rejects a model id outside the catalog and leaves the draft model unchanged", async () => {
	const db = createTestProductDb();
	await seedCurationDraft(db);
	const tools = boundToolsFor(db);

	const result = await executeTool(tools.set_model, { modelId: "google:not-real" });

	assert.match(result, /not in the supported model catalog/u);
	const draft = await readDraft(db);
	assert.equal(draft.modelBehavior.modelId, DEFAULT_MODEL_ID);
});

test("set_model preserves enabled-tool Permissions while switching providers", async () => {
	const db = createTestProductDb();
	await seedCurationDraft(db);
	const tools = boundToolsFor(db);

	await executeTool(tools.enable_tool, { toolId: "web_search" });
	await executeTool(tools.set_model, { modelId: "openai:gpt-4o-mini" });

	const draft = await readDraft(db);
	const kinds = draft.requestedPermissions.map((permission) => permission.kind).toSorted();
	assert.deepEqual(kinds, ["built_in_web_read", "model_provider_credential"]);
	const credential = draft.requestedPermissions.find(
		(permission) => permission.kind === "model_provider_credential",
	);
	assert.equal(
		credential?.kind === "model_provider_credential" ? credential.providerId : null,
		"openai",
	);
});

test("set_model recovers an MCP tool's risk when re-deriving its Permission", async () => {
	const db = createTestProductDb();
	await seedCurationDraft(db);
	const tools = boundToolsFor(db);

	await executeTool(tools.enable_tool, { risk: "mutating", toolId: "github-mcp:open_pr" });
	await executeTool(tools.set_model, { modelId: "openai:gpt-4o-mini" });

	const draft = await readDraft(db);
	const mcpRequest = draft.requestedPermissions.find(
		(permission): permission is McpToolAccessPermissionRequest =>
			permission.kind === "mcp_tool_access",
	);
	assert.equal(mcpRequest?.risk, "mutating");
	assert.equal(mcpRequest?.serverId, "github-mcp");
});

test("enable_tool is idempotent: re-enabling a tool reports it and writes nothing new", async () => {
	const db = createTestProductDb();
	await seedCurationDraft(db);
	const tools = boundToolsFor(db);

	await executeTool(tools.enable_tool, { toolId: "web_search" });
	const before = await readDraft(db);

	const result = await executeTool(tools.enable_tool, { toolId: "web_search" });

	assert.match(result, /already enabled/u);
	const after = await readDraft(db);
	assert.deepEqual(after.toolEnablements, before.toolEnablements);
	assert.deepEqual(after.requestedPermissions, before.requestedPermissions);
});

test("enable_tool fails product-safely on a malformed MCP id and writes nothing", async () => {
	const db = createTestProductDb();
	await seedCurationDraft(db);
	const tools = boundToolsFor(db);
	const before = await readDraft(db);

	const result = await executeTool(tools.enable_tool, { toolId: ":missing-server" });

	assert.match(result, /server ID/u);
	const after = await readDraft(db);
	assert.deepEqual(after.toolEnablements, before.toolEnablements);
	assert.deepEqual(after.requestedPermissions, before.requestedPermissions);
});

/**
 * The core acceptance: enabling a tool through the Curator derives the exact
 * same enablement + requested Permission the owner UI's `updateToolSelections`
 * derives, because both route through the shared `tool-selection` seam.
 */
const assertEnableToolMatchesUpdateToolSelections = async ({
	enableInput,
	updateInput,
}: {
	enableInput: { risk?: "read_only" | "mutating" | "unknown"; toolId: string };
	updateInput: Record<string, unknown>;
}): Promise<void> => {
	const curatorDb = createTestProductDb();
	await seedCurationDraft(curatorDb);
	await executeTool(boundToolsFor(curatorDb).enable_tool, enableInput);
	const curatorDraft = await readDraft(curatorDb);

	const ownerDb = createTestProductDb();
	await seedCurationDraft(ownerDb);
	await call(
		thinkspacesRouter.updateToolSelections,
		{ selections: [], thinkspaceId: DRAFT_ID, ...updateInput },
		{ context: updateToolSelectionsContext(ownerDb) },
	);
	const ownerDraft = await getDraftAgentProfileRevision(ownerDb, { thinkspaceId: DRAFT_ID });
	assert.ok(ownerDraft);

	assert.deepEqual(curatorDraft.toolEnablements, ownerDraft.toolEnablements);
	assert.deepEqual(
		curatorDraft.requestedPermissions as RequestedPermission[],
		ownerDraft.requestedPermissions as RequestedPermission[],
	);
};

test("enable_tool derives a built-in tool exactly as updateToolSelections does", async () => {
	await assertEnableToolMatchesUpdateToolSelections({
		enableInput: { toolId: "web_search" },
		updateInput: { builtInToolIds: ["web_search"] },
	});
});

test("enable_tool derives a connected-account tool exactly as updateToolSelections does", async () => {
	await assertEnableToolMatchesUpdateToolSelections({
		enableInput: { toolId: "github:create_issue" },
		updateInput: { connectedAccountToolIds: ["github:create_issue"] },
	});
});

test("enable_tool derives an MCP tool exactly as updateToolSelections does", async () => {
	await assertEnableToolMatchesUpdateToolSelections({
		enableInput: { risk: "read_only", toolId: "cloudflare-docs" },
		updateInput: { selections: [{ risk: "read_only", serverId: "cloudflare-docs" }] },
	});
});
