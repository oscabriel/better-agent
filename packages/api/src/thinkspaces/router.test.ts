import assert from "node:assert/strict";
import test from "node:test";

import type { ProductDb } from "@better-agent/db";
import { thinkspaceAgentProfiles } from "@better-agent/db/schema/agent-profiles";
import { user } from "@better-agent/db/schema/auth";
import {
	THINKSPACE_PERMISSION_KINDS,
	thinkspacePermissions,
} from "@better-agent/db/schema/permissions";
import { thinkspaces } from "@better-agent/db/schema/thinkspaces";
import { ORPCError, call } from "@orpc/server";
import type { AnyProcedure } from "@orpc/server";
import { eq } from "drizzle-orm";

import type { Context } from "../context";
import { getModelCatalog } from "../models/catalog";
import type { ModelCatalogEntry } from "../models/catalog";
import { encryptCredential } from "../models/credentials";
import { createMemoryModelCatalog } from "../models/model-catalog";
import type { ModelCatalog } from "../models/model-catalog";
import { createTestProductDb } from "../testing/product-db";
import type { ToolEnablement } from "./agent-profile";
import { thinkspacesRouter } from "./router";
import type { ThinkspaceTurnInspection } from "./inspect";
import type { ThinkspaceTurnAcceptance } from "./turns";

const OWNED_THINKSPACE_ID = "thinkspace_router";
const NOW = new Date("2026-06-10T12:00:00.000Z");

/**
 * A db that fails the test if any query is attempted. Used to prove that
 * rejected requests never reach product storage.
 */
const untouchableDb = new Proxy({} as Record<string, unknown>, {
	get(_target, property) {
		throw new Error(`Product storage must not be touched (accessed ${String(property)}).`);
	},
}) as unknown as ProductDb;

/**
 * Minimal structural stand-in for the drizzle select chain used by the
 * Thinkspace repository and model settings reads. Every select resolves to
 * the configured rows.
 */
const createDbReturning = (rows: Record<string, unknown>[]): ProductDb =>
	({
		select: () => ({
			from: () => ({
				where: () => ({
					limit: () => Promise.resolve(rows),
					orderBy: () => Promise.resolve(rows),
				}),
			}),
		}),
	}) as unknown as ProductDb;

const createDbForThinkspaceCreation = (settingsRows: Record<string, unknown>[] = []) => {
	const inserted: Record<string, unknown>[] = [];
	const db = {
		batch: () =>
			Promise.resolve([[{ ...inserted[0], createdAt: NOW, updatedAt: NOW }], [{ ...inserted[1] }]]),
		insert: () => ({
			values: (value: Record<string, unknown>) => {
				inserted.push(value);
				return { returning: () => ({ value }) };
			},
		}),
		select: () => ({
			from: () => ({
				where: () => ({ limit: () => Promise.resolve(settingsRows) }),
			}),
		}),
	};

	return { db: db as unknown as ProductDb, inserted };
};

const createDbForAgentProfileDraftUpdate = (row: Record<string, unknown>) => {
	const saved: Record<string, unknown>[] = [];
	const db = {
		insert: () => ({
			values: (value: Record<string, unknown>) => ({
				onConflictDoUpdate: () => ({
					returning: () => {
						saved.push(value);
						return Promise.resolve([value]);
					},
				}),
			}),
		}),
		select: () => ({
			from: () => ({
				where: () => ({ limit: () => Promise.resolve([row]) }),
			}),
		}),
	};

	return { db: db as unknown as ProductDb, saved };
};

const createDbForAgentProfileActivation = (row: Record<string, unknown>) => {
	const patches: Record<string, unknown>[] = [];
	const db = {
		batch: (statements: unknown[]) => Promise.resolve(statements.map(() => [])),
		select: () => ({
			from: () => ({
				where: () => ({ limit: () => Promise.resolve([row]) }),
			}),
		}),
		update: () => ({
			set: (patch: Record<string, unknown>) => ({
				where: () => {
					patches.push(patch);
					return { patch };
				},
			}),
		}),
	};

	return { db: db as unknown as ProductDb, patches };
};

const ownedAgentProfileColumns = (status: "active" | "draft" = "active") => ({
	activatedAt: status === "active" ? NOW : null,
	createdAt: NOW,
	displayName: "Release Monitor",
	id: OWNED_THINKSPACE_ID,
	instructions: "Watch SDK releases.",
	modelId: "google:gemini-2.5-flash-lite",
	reasoningLevel: "medium",
	requestedPermissions: "[]",
	routines: "[]",
	skillReferences: "[]",
	status,
	supersededAt: null,
	thinkspaceId: OWNED_THINKSPACE_ID,
	toolEnablements: "[]",
	updatedAt: NOW,
	version: 1,
});

const ownedThinkspaceRow = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
	...ownedAgentProfileColumns(),
	archivedAt: null,
	configurationSummary: "Watch release notes and draft a handoff.",
	goal: "Monitor releases",
	id: OWNED_THINKSPACE_ID,
	memoryGovernance: "{}",
	ownerUserId: "owner_user",
	requestedPermissions: "[]",
	...overrides,
});

const authenticatedSession = {
	session: { id: "session_1" },
	user: { id: "owner_user" },
};

/**
 * Memory ModelCatalog over the reviewed static entries plus a models.dev-only
 * entry, so router tests never reach the live models.dev fetch path.
 */
const modelsDevOnlyEntry: ModelCatalogEntry = {
	capabilities: ["text", "tools", "reasoning"],
	contextWindow: 1_048_576,
	description: "Gemini catalog-only test model from the models.dev catalog.",
	id: "google:gemini-catalog-only",
	maxOutputTokens: 65_536,
	name: "Gemini Catalog Only",
	providerId: "google",
	providerName: "Google",
	reasoning: "google_thinking_config",
	reviewedAt: "2026-06-10",
	source: "models.dev API catalog (https://models.dev/api.json).",
};

const memoryModelCatalog = createMemoryModelCatalog([...getModelCatalog(), modelsDevOnlyEntry]);

const createCallContext = ({
	db,
	env = {},
	modelCatalog = memoryModelCatalog,
	session = authenticatedSession,
}: {
	db: ProductDb;
	env?: Record<string, unknown>;
	modelCatalog?: ModelCatalog;
	session?: typeof authenticatedSession | null;
}): Context =>
	({
		db,
		env,
		executionCtx: undefined,
		headers: new Headers(),
		modelCatalog,
		session,
	}) as unknown as Context;

const firstClassMcpPermissionRequest = (serverId = "cloudflare-docs") => ({
	kind: "mcp_tool_access" as const,
	reason: `Allow this Thinkspace Agent to read all explicitly enabled tools from the ${serverId} MCP server.`,
	risk: "read_only" as const,
	scope: { type: "server" as const },
	serverId,
});

const seedRealThinkspaceWithProfile = async ({
	db,
	profileStatus = "draft",
	requestedPermissions = [],
	thinkspaceStatus = "draft",
	toolEnablements = [{ source: "mcp_server", toolId: "cloudflare-docs" }],
}: {
	db: ProductDb;
	profileStatus?: "active" | "draft";
	requestedPermissions?: unknown[];
	thinkspaceStatus?: "active" | "draft";
	toolEnablements?: ToolEnablement[];
}) => {
	await db.insert(user).values({
		email: "owner@example.com",
		id: authenticatedSession.user.id,
		name: "Owner",
	});
	await db.insert(thinkspaces).values({
		configurationSummary: "Watch release notes and draft a handoff.",
		goal: "Monitor releases",
		id: OWNED_THINKSPACE_ID,
		ownerUserId: authenticatedSession.user.id,
		status: thinkspaceStatus,
	});
	await db.insert(thinkspaceAgentProfiles).values({
		...ownedAgentProfileColumns(profileStatus),
		id: `profile_${profileStatus}_${crypto.randomUUID()}`,
		requestedPermissions: JSON.stringify(requestedPermissions),
		status: profileStatus,
		thinkspaceId: OWNED_THINKSPACE_ID,
		toolEnablements: JSON.stringify(toolEnablements),
	});
};

interface RuntimeOperationAttempt {
	input: Record<string, string>;
	name: string;
	procedure: AnyProcedure;
}

const runtimeOperations: readonly RuntimeOperationAttempt[] = [
	{
		input: { thinkspaceId: OWNED_THINKSPACE_ID },
		name: "runtimeReadiness",
		procedure: thinkspacesRouter.runtimeReadiness,
	},
	{
		input: { thinkspaceId: OWNED_THINKSPACE_ID },
		name: "runtimePolicy",
		procedure: thinkspacesRouter.runtimePolicy,
	},
	{
		input: { thinkspaceId: OWNED_THINKSPACE_ID },
		name: "modelReadiness",
		procedure: thinkspacesRouter.modelReadiness,
	},
	{
		input: {
			idempotencyKey: "retry-key-1",
			instruction: "Summarize the Thinkspace goal.",
			thinkspaceId: OWNED_THINKSPACE_ID,
		},
		name: "submitTurn",
		procedure: thinkspacesRouter.submitTurn,
	},
	{
		input: { submissionId: "submission_1", thinkspaceId: OWNED_THINKSPACE_ID },
		name: "inspectTurn",
		procedure: thinkspacesRouter.inspectTurn,
	},
];

const expectCode =
	(code: string) =>
	(error: unknown): boolean =>
		error instanceof ORPCError && error.code === code;

test("creating a Thinkspace persists a draft Agent Profile revision seeded from settings", async () => {
	const { db, inserted } = createDbForThinkspaceCreation([
		{ defaultModel: "google:gemini-catalog-only", reasoningEffort: "high" },
	]);
	const context = createCallContext({ db });

	const created = await call(
		thinkspacesRouter.create,
		{
			configurationSummary: " Watch model catalog changes. ",
			goal: " Monitor model catalog releases ",
			initialInstructions: " Use release notes first. ",
		},
		{ context },
	);

	assert.ok(created);
	assert.equal(created.status, "draft");
	assert.equal(created.agentProfileRevision.status, "draft");
	assert.equal(created.agentProfileRevision.identity.displayName, "Monitor model catalog releases");
	assert.equal(created.agentProfileRevision.identity.instructions, "Use release notes first.");
	assert.deepEqual(created.agentProfileRevision.modelBehavior, {
		modelId: "google:gemini-catalog-only",
		reasoningLevel: "high",
	});
	assert.equal(inserted[0]?.status, "draft");
	assert.equal("initialInstructions" in (inserted[0] ?? {}), false);
	assert.equal("selectedSkillIds" in (inserted[0] ?? {}), false);
	assert.equal(inserted[1]?.status, "draft");
});

test("creating a Thinkspace rejects models outside the catalog before persistence", async () => {
	const { db, inserted } = createDbForThinkspaceCreation([
		{ defaultModel: "google:not-real", reasoningEffort: "medium" },
	]);

	await assert.rejects(
		call(
			thinkspacesRouter.create,
			{
				configurationSummary: "Track unsupported models.",
				goal: "Track unsupported models",
			},
			{ context: createCallContext({ db }) },
		),
		expectCode("BAD_REQUEST"),
	);
	assert.equal(inserted.length, 0);
});

test("owners can activate the draft Agent Profile revision and draft Thinkspace together", async () => {
	const { db, patches } = createDbForAgentProfileActivation(
		ownedThinkspaceRow({ ...ownedAgentProfileColumns("draft"), status: "draft" }),
	);
	const context = createCallContext({ db });

	const activation = await call(
		thinkspacesRouter.activateAgentProfile,
		{ thinkspaceId: OWNED_THINKSPACE_ID },
		{ context },
	);

	assert.ok(activation);
	assert.equal(activation.activatedRevision.status, "active");
	assert.equal(activation.thinkspaceStatus, "active");
	assert.ok(patches.some((patch) => patch.status === "active" && patch.version === 1));
	assert.ok(patches.some((patch) => patch.status === "active" && !("version" in patch)));
});

test("activating a granted MCP request creates a Thinkspace Permission grant and clears active requests", async () => {
	const db = createTestProductDb();
	await seedRealThinkspaceWithProfile({
		db,
		requestedPermissions: [firstClassMcpPermissionRequest()],
	});

	const activation = await call(
		thinkspacesRouter.activateAgentProfile,
		{ grantedPermissionIndexes: [0], thinkspaceId: OWNED_THINKSPACE_ID },
		{ context: createCallContext({ db }) },
	);

	assert.ok(activation);
	assert.equal(activation.activatedRevision.status, "active");
	assert.equal("requestedPermissions" in activation.activatedRevision, false);
	assert.equal(activation.grantedPermissions.length, 1);
	assert.equal(activation.grantedPermissions[0]?.kind, THINKSPACE_PERMISSION_KINDS.MCP_TOOL_ACCESS);
	assert.equal(activation.grantedPermissions[0]?.providerId, "cloudflare-docs");
	assert.equal(activation.grantedPermissions[0]?.resourceScope, JSON.stringify({ type: "server" }));
});

test("declining an MCP request creates no grant while activation still succeeds", async () => {
	const db = createTestProductDb();
	await seedRealThinkspaceWithProfile({
		db,
		requestedPermissions: [firstClassMcpPermissionRequest()],
	});

	const activation = await call(
		thinkspacesRouter.activateAgentProfile,
		{ grantedPermissionIndexes: [], thinkspaceId: OWNED_THINKSPACE_ID },
		{ context: createCallContext({ db }) },
	);
	const grants = await db.select().from(thinkspacePermissions);

	assert.ok(activation);
	assert.equal(activation.activatedRevision.status, "active");
	assert.deepEqual(activation.grantedPermissions, []);
	assert.deepEqual(grants, []);
});

test("invalid MCP grants reject before the draft activates", async () => {
	const db = createTestProductDb();
	await seedRealThinkspaceWithProfile({
		db,
		requestedPermissions: [firstClassMcpPermissionRequest("context7")],
	});

	await assert.rejects(
		call(
			thinkspacesRouter.activateAgentProfile,
			{ thinkspaceId: OWNED_THINKSPACE_ID },
			{ context: createCallContext({ db }) },
		),
		expectCode("BAD_REQUEST"),
	);

	const [revision] = await db
		.select({ status: thinkspaceAgentProfiles.status })
		.from(thinkspaceAgentProfiles)
		.where(eq(thinkspaceAgentProfiles.thinkspaceId, OWNED_THINKSPACE_ID));
	assert.equal(revision?.status, "draft");
});

test("updating tools writes enablements and permission requests to the draft Agent Profile", async () => {
	const { db, saved } = createDbForAgentProfileDraftUpdate(
		ownedThinkspaceRow({ ...ownedAgentProfileColumns("draft"), status: "draft" }),
	);
	const context = createCallContext({ db });

	const updated = await call(
		thinkspacesRouter.updateToolSelections,
		{
			selections: [{ risk: "mutating", serverId: "github", toolName: "create_issue" }],
			thinkspaceId: OWNED_THINKSPACE_ID,
		},
		{ context },
	);

	assert.ok(updated);
	assert.equal(updated.agentProfileRevision.status, "draft");
	assert.equal(
		saved[0]?.toolEnablements,
		'[{"source":"mcp_server","toolId":"github:create_issue"}]',
	);
	assert.match(String(saved[0]?.requestedPermissions), /mcp_tool_access/u);
	assert.doesNotMatch(String(saved[0]?.requestedPermissions), /mcp_tool_permission_placeholder/u);
	assert.equal("enabledToolIds" in (saved[0] ?? {}), false);
});

test("Agent Profile activation rejects archived Thinkspaces before writes", async () => {
	const { db, patches } = createDbForAgentProfileActivation(
		ownedThinkspaceRow({ status: "archived" }),
	);

	await assert.rejects(
		call(
			thinkspacesRouter.activateAgentProfile,
			{ thinkspaceId: OWNED_THINKSPACE_ID },
			{ context: createCallContext({ db }) },
		),
		expectCode("BAD_REQUEST"),
	);
	assert.deepEqual(patches, []);
});

test("Agent Profile activation rejects Thinkspaces without a draft revision", async () => {
	const { db, patches } = createDbForAgentProfileActivation(ownedThinkspaceRow());

	await assert.rejects(
		call(
			thinkspacesRouter.activateAgentProfile,
			{ thinkspaceId: OWNED_THINKSPACE_ID },
			{ context: createCallContext({ db }) },
		),
		expectCode("BAD_REQUEST"),
	);
	assert.deepEqual(patches, []);
});

test("unauthenticated requests cannot reach any Thinkspace runtime operation", async () => {
	for (const operation of runtimeOperations) {
		await assert.rejects(
			call(operation.procedure, operation.input, {
				context: createCallContext({ db: untouchableDb, session: null }),
			}),
			expectCode("UNAUTHORIZED"),
			`${operation.name} must reject unauthenticated requests`,
		);
	}
});

test("authenticated non-owners get NOT_FOUND for every runtime operation before runtime access", async () => {
	for (const operation of runtimeOperations) {
		await assert.rejects(
			call(operation.procedure, operation.input, {
				context: createCallContext({
					db: createDbReturning([]),
					session: { session: { id: "session_2" }, user: { id: "other_user" } },
				}),
			}),
			expectCode("NOT_FOUND"),
			`${operation.name} must hide other users' Thinkspaces`,
		);
	}
});

test("guessed or missing Thinkspace ids cannot resolve runtime access", async () => {
	for (const operation of runtimeOperations) {
		await assert.rejects(
			call(
				operation.procedure,
				{ ...operation.input, thinkspaceId: "thinkspace_guessed" },
				{ context: createCallContext({ db: createDbReturning([]) }) },
			),
			expectCode("NOT_FOUND"),
			`${operation.name} must not resolve guessed Thinkspace ids`,
		);
	}
});

test("oversized runtime inputs are rejected at the router boundary without touching storage", async () => {
	const oversized: { input: Record<string, string>; procedure: AnyProcedure }[] = [
		{
			input: {
				idempotencyKey: "k".repeat(129),
				instruction: "Summarize the Thinkspace goal.",
				thinkspaceId: OWNED_THINKSPACE_ID,
			},
			procedure: thinkspacesRouter.submitTurn,
		},
		{
			input: {
				idempotencyKey: "retry-key-1",
				instruction: "x".repeat(4001),
				thinkspaceId: OWNED_THINKSPACE_ID,
			},
			procedure: thinkspacesRouter.submitTurn,
		},
		{
			input: { submissionId: "s".repeat(129), thinkspaceId: OWNED_THINKSPACE_ID },
			procedure: thinkspacesRouter.inspectTurn,
		},
	];

	for (const attempt of oversized) {
		await assert.rejects(
			call(attempt.procedure, attempt.input, {
				context: createCallContext({ db: untouchableDb }),
			}),
			expectCode("BAD_REQUEST"),
		);
	}
});

test("runtime resolution failures never expose binding details to the product surface", async () => {
	const operations: { input: Record<string, string>; procedure: AnyProcedure }[] = [
		{
			input: { thinkspaceId: OWNED_THINKSPACE_ID },
			procedure: thinkspacesRouter.runtimeReadiness,
		},
		{
			input: { submissionId: "submission_1", thinkspaceId: OWNED_THINKSPACE_ID },
			procedure: thinkspacesRouter.inspectTurn,
		},
	];

	for (const operation of operations) {
		await assert.rejects(
			call(operation.procedure, operation.input, {
				context: createCallContext({ db: createDbReturning([ownedThinkspaceRow()]) }),
			}),
			(error: unknown) => {
				assert.ok(error instanceof ORPCError);
				assert.equal(error.code, "INTERNAL_SERVER_ERROR");
				assert.doesNotMatch(error.message, /binding/iu);
				assert.doesNotMatch(error.message, /THINKSPACE_AGENT/u);
				assert.doesNotMatch(error.message, /durable/iu);
				return true;
			},
		);
	}
});

test("missing model credentials fail closed with a product-safe error before runtime acceptance", async () => {
	await assert.rejects(
		call(
			thinkspacesRouter.submitTurn,
			{
				idempotencyKey: "retry-key-1",
				instruction: "Summarize the Thinkspace goal.",
				thinkspaceId: OWNED_THINKSPACE_ID,
			},
			{ context: createCallContext({ db: createDbReturning([ownedThinkspaceRow()]) }) },
		),
		(error: unknown) => {
			assert.ok(error instanceof ORPCError);
			assert.equal(error.code, "BAD_REQUEST");
			assert.doesNotMatch(error.message, /API_KEY/u);
			assert.doesNotMatch(error.message, /sk-/u);
			assert.doesNotMatch(error.message, /binding/iu);
			return true;
		},
	);
});

test("owners can still submit and inspect turns through the router with the Thinkspace runtime identity", async () => {
	const runtimeNames: string[] = [];
	const acceptance: ThinkspaceTurnAcceptance = {
		acceptedAt: 1_717_000_000_000,
		deduplicated: false,
		idempotencyKey: "retry-key-1",
		profileRevisionId: OWNED_THINKSPACE_ID,
		profileVersion: 1,
		status: "accepted",
		submissionId: "submission_1",
		thinkspaceId: OWNED_THINKSPACE_ID,
	};
	const inspection: ThinkspaceTurnInspection = {
		acceptedAt: 1_717_000_000_000,
		completedAt: null,
		message: "Accepted. This Thinkspace Agent turn is waiting for the runtime to start it.",
		profileRevisionId: OWNED_THINKSPACE_ID,
		profileVersion: 1,
		resultText: null,
		startedAt: null,
		status: "accepted",
		submissionId: "submission_1",
		thinkspaceId: OWNED_THINKSPACE_ID,
	};
	const env = {
		BETTER_AUTH_SECRET: "test-secret",
		THINKSPACE_AGENT: {
			get: () => ({
				acceptTurnSubmission: () => Promise.resolve(acceptance),
				inspectTurnSubmission: () => Promise.resolve(inspection),
			}),
			idFromName: (name: string) => {
				runtimeNames.push(name);
				return { toString: () => `durable-object-id:${name}` };
			},
		},
	};
	// The structural db mock returns this row for every select, so it doubles
	// as the Thinkspace row (granted credential Permission), the settings row,
	// and the saved provider-credential row.
	const readyRow = {
		...ownedThinkspaceRow(),
		encryptedCredential: await encryptCredential("google-test-key", "test-secret"),
		requestedPermissions: JSON.stringify([
			{
				granted: true,
				providerId: "google",
				type: "model_provider_credential_permission",
			},
		]),
	};
	const context = createCallContext({ db: createDbReturning([readyRow]), env });

	const submitted = await call(
		thinkspacesRouter.submitTurn,
		{
			idempotencyKey: "retry-key-1",
			instruction: "Summarize the Thinkspace goal.",
			thinkspaceId: OWNED_THINKSPACE_ID,
		},
		{ context },
	);
	const inspected = await call(
		thinkspacesRouter.inspectTurn,
		{ submissionId: "submission_1", thinkspaceId: OWNED_THINKSPACE_ID },
		{ context },
	);

	assert.equal(submitted.status, "accepted");
	assert.equal(submitted.submissionId, "submission_1");
	assert.equal(inspected.status, "accepted");
	assert.ok(runtimeNames.every((name) => name === OWNED_THINKSPACE_ID));
});

test("a turn submits end-to-end on a models.dev-only model from a credentialed, Permission-granted provider", async () => {
	const acceptance: ThinkspaceTurnAcceptance = {
		acceptedAt: 1_717_000_000_000,
		deduplicated: false,
		idempotencyKey: "retry-key-2",
		profileRevisionId: OWNED_THINKSPACE_ID,
		profileVersion: 1,
		status: "accepted",
		submissionId: "submission_2",
		thinkspaceId: OWNED_THINKSPACE_ID,
	};
	const env = {
		BETTER_AUTH_SECRET: "test-secret",
		THINKSPACE_AGENT: {
			get: () => ({ acceptTurnSubmission: () => Promise.resolve(acceptance) }),
			idFromName: (name: string) => ({ toString: () => `durable-object-id:${name}` }),
		},
	};
	// The same structural row serves the Thinkspace, settings (default model
	// pinned to a models.dev-only id), and saved-credential selects.
	const readyRow = {
		...ownedThinkspaceRow(),
		defaultModel: "google:gemini-catalog-only",
		encryptedCredential: await encryptCredential("google-test-key", "test-secret"),
		reasoningEffort: "medium",
		requestedPermissions: JSON.stringify([
			{
				granted: true,
				providerId: "google",
				type: "model_provider_credential_permission",
			},
		]),
	};
	const context = createCallContext({ db: createDbReturning([readyRow]), env });

	const submitted = await call(
		thinkspacesRouter.submitTurn,
		{
			idempotencyKey: "retry-key-2",
			instruction: "Summarize the Thinkspace goal.",
			thinkspaceId: OWNED_THINKSPACE_ID,
		},
		{ context },
	);

	assert.equal(submitted.status, "accepted");
	assert.equal(submitted.submissionId, "submission_2");
});

test("Thinkspace control-plane reads still work for owners", async () => {
	const context = createCallContext({ db: createDbReturning([ownedThinkspaceRow()]) });

	const thinkspace = await call(
		thinkspacesRouter.get,
		{ thinkspaceId: OWNED_THINKSPACE_ID },
		{ context },
	);
	const listed = await call(thinkspacesRouter.list, undefined, { context });

	assert.equal(thinkspace.id, OWNED_THINKSPACE_ID);
	assert.equal(thinkspace.agentProfileRevision?.identity.instructions, "Watch SDK releases.");
	assert.equal(listed.length, 1);
});

test("Thinkspace detail includes MCP grants and remains owner-gated", async () => {
	const db = createTestProductDb();
	await seedRealThinkspaceWithProfile({ db, profileStatus: "active", thinkspaceStatus: "active" });
	await db.insert(thinkspacePermissions).values({
		grantedByUserId: authenticatedSession.user.id,
		id: "thinkspace_permission_cloudflare_docs",
		kind: THINKSPACE_PERMISSION_KINDS.MCP_TOOL_ACCESS,
		providerId: "cloudflare-docs",
		reason: "Allow this Thinkspace Agent to read Cloudflare docs.",
		resourceScope: JSON.stringify({ type: "server" }),
		thinkspaceId: OWNED_THINKSPACE_ID,
	});

	const thinkspace = await call(
		thinkspacesRouter.get,
		{ thinkspaceId: OWNED_THINKSPACE_ID },
		{ context: createCallContext({ db }) },
	);

	assert.equal(thinkspace.grantedPermissions.length, 1);
	assert.equal(thinkspace.grantedPermissions[0]?.kind, THINKSPACE_PERMISSION_KINDS.MCP_TOOL_ACCESS);
	assert.equal(thinkspace.grantedPermissions[0]?.providerId, "cloudflare-docs");
	assert.equal(thinkspace.grantedPermissions[0]?.resourceScope, JSON.stringify({ type: "server" }));

	await assert.rejects(
		call(
			thinkspacesRouter.get,
			{ thinkspaceId: OWNED_THINKSPACE_ID },
			{
				context: createCallContext({
					db,
					session: { session: { id: "session_other" }, user: { id: "other_user" } },
				}),
			},
		),
		expectCode("NOT_FOUND"),
	);
});

test("Thinkspace detail includes active revision tool potency indicators", async () => {
	const db = createTestProductDb();
	await seedRealThinkspaceWithProfile({
		db,
		profileStatus: "active",
		thinkspaceStatus: "active",
		toolEnablements: [
			{ source: "built_in", toolId: "web_search" },
			{ source: "mcp_server", toolId: "cloudflare-docs" },
			{ source: "mcp_server", toolId: "aws-knowledge" },
			{ source: "connected_account", toolId: "github" },
			{ source: "local_node", toolId: "local-files" },
		],
	});
	await db.insert(thinkspacePermissions).values([
		{
			grantedByUserId: authenticatedSession.user.id,
			id: "thinkspace_permission_cloudflare_docs",
			kind: THINKSPACE_PERMISSION_KINDS.MCP_TOOL_ACCESS,
			providerId: "cloudflare-docs",
			reason: "Allow this Thinkspace Agent to read Cloudflare docs.",
			resourceScope: JSON.stringify({ type: "server" }),
			thinkspaceId: OWNED_THINKSPACE_ID,
		},
		{
			grantedByUserId: authenticatedSession.user.id,
			id: "thinkspace_permission_microsoft_learn",
			kind: THINKSPACE_PERMISSION_KINDS.MCP_TOOL_ACCESS,
			providerId: "microsoft-learn",
			reason: "An unenabled grant should not add a tool.",
			resourceScope: JSON.stringify({ type: "server" }),
			thinkspaceId: OWNED_THINKSPACE_ID,
		},
	]);

	const thinkspace = await call(
		thinkspacesRouter.get,
		{ thinkspaceId: OWNED_THINKSPACE_ID },
		{ context: createCallContext({ db }) },
	);

	assert.deepEqual(thinkspace.enabledToolPotencies, [
		{ potency: "potent", source: "built_in", toolId: "web_search" },
		{ potency: "potent", source: "mcp_server", toolId: "cloudflare-docs" },
		{ potency: "inert", source: "mcp_server", toolId: "aws-knowledge" },
		{ potency: "inert", source: "connected_account", toolId: "github" },
		{ potency: "inert", source: "local_node", toolId: "local-files" },
	]);

	await assert.rejects(
		call(
			thinkspacesRouter.get,
			{ thinkspaceId: OWNED_THINKSPACE_ID },
			{
				context: createCallContext({
					db,
					session: { session: { id: "session_other" }, user: { id: "other_user" } },
				}),
			},
		),
		expectCode("NOT_FOUND"),
	);
});

test("Thinkspace detail tool potency indicators reflect Permission revocation on the next read", async () => {
	const db = createTestProductDb();
	await seedRealThinkspaceWithProfile({ db, profileStatus: "active", thinkspaceStatus: "active" });
	await db.insert(thinkspacePermissions).values({
		grantedByUserId: authenticatedSession.user.id,
		id: "thinkspace_permission_cloudflare_docs",
		kind: THINKSPACE_PERMISSION_KINDS.MCP_TOOL_ACCESS,
		providerId: "cloudflare-docs",
		reason: "Allow this Thinkspace Agent to read Cloudflare docs.",
		resourceScope: JSON.stringify({ type: "server" }),
		thinkspaceId: OWNED_THINKSPACE_ID,
	});

	const granted = await call(
		thinkspacesRouter.get,
		{ thinkspaceId: OWNED_THINKSPACE_ID },
		{ context: createCallContext({ db }) },
	);
	await call(
		thinkspacesRouter.revokePermission,
		{
			permissionId: "thinkspace_permission_cloudflare_docs",
			thinkspaceId: OWNED_THINKSPACE_ID,
		},
		{ context: createCallContext({ db }) },
	);
	const revoked = await call(
		thinkspacesRouter.get,
		{ thinkspaceId: OWNED_THINKSPACE_ID },
		{ context: createCallContext({ db }) },
	);

	assert.deepEqual(granted.enabledToolPotencies, [
		{ potency: "potent", source: "mcp_server", toolId: "cloudflare-docs" },
	]);
	assert.deepEqual(revoked.enabledToolPotencies, [
		{ potency: "inert", source: "mcp_server", toolId: "cloudflare-docs" },
	]);
});

test("owners can revoke a granted MCP Permission without mutating Agent Profile revisions", async () => {
	const db = createTestProductDb();
	await seedRealThinkspaceWithProfile({ db, profileStatus: "active", thinkspaceStatus: "active" });
	await db.insert(thinkspacePermissions).values({
		grantedByUserId: authenticatedSession.user.id,
		id: "thinkspace_permission_cloudflare_docs",
		kind: THINKSPACE_PERMISSION_KINDS.MCP_TOOL_ACCESS,
		providerId: "cloudflare-docs",
		reason: "Allow this Thinkspace Agent to read Cloudflare docs.",
		resourceScope: JSON.stringify({ type: "server" }),
		thinkspaceId: OWNED_THINKSPACE_ID,
	});
	const revisionsBefore = await db
		.select()
		.from(thinkspaceAgentProfiles)
		.where(eq(thinkspaceAgentProfiles.thinkspaceId, OWNED_THINKSPACE_ID));

	const revoked = await call(
		thinkspacesRouter.revokePermission,
		{
			permissionId: "thinkspace_permission_cloudflare_docs",
			thinkspaceId: OWNED_THINKSPACE_ID,
		},
		{ context: createCallContext({ db }) },
	);
	const remainingGrants = await db
		.select()
		.from(thinkspacePermissions)
		.where(eq(thinkspacePermissions.thinkspaceId, OWNED_THINKSPACE_ID));
	const revisionsAfter = await db
		.select()
		.from(thinkspaceAgentProfiles)
		.where(eq(thinkspaceAgentProfiles.thinkspaceId, OWNED_THINKSPACE_ID));
	const detailAfterRevocation = await call(
		thinkspacesRouter.get,
		{ thinkspaceId: OWNED_THINKSPACE_ID },
		{ context: createCallContext({ db }) },
	);

	assert.equal(revoked.revokedPermissionId, "thinkspace_permission_cloudflare_docs");
	assert.equal(revoked.thinkspaceId, OWNED_THINKSPACE_ID);
	assert.deepEqual(remainingGrants, []);
	assert.deepEqual(detailAfterRevocation.grantedPermissions, []);
	assert.deepEqual(revisionsAfter, revisionsBefore);
});

test("non-owners cannot revoke another user's Thinkspace Permission", async () => {
	const db = createTestProductDb();
	await seedRealThinkspaceWithProfile({ db, profileStatus: "active", thinkspaceStatus: "active" });
	await db.insert(thinkspacePermissions).values({
		grantedByUserId: authenticatedSession.user.id,
		id: "thinkspace_permission_cloudflare_docs",
		kind: THINKSPACE_PERMISSION_KINDS.MCP_TOOL_ACCESS,
		providerId: "cloudflare-docs",
		reason: "Allow this Thinkspace Agent to read Cloudflare docs.",
		resourceScope: JSON.stringify({ type: "server" }),
		thinkspaceId: OWNED_THINKSPACE_ID,
	});

	await assert.rejects(
		call(
			thinkspacesRouter.revokePermission,
			{
				permissionId: "thinkspace_permission_cloudflare_docs",
				thinkspaceId: OWNED_THINKSPACE_ID,
			},
			{
				context: createCallContext({
					db,
					session: { session: { id: "session_other" }, user: { id: "other_user" } },
				}),
			},
		),
		expectCode("NOT_FOUND"),
	);

	const [remainingGrant] = await db
		.select()
		.from(thinkspacePermissions)
		.where(eq(thinkspacePermissions.id, "thinkspace_permission_cloudflare_docs"));
	assert.equal(remainingGrant?.id, "thinkspace_permission_cloudflare_docs");
});
