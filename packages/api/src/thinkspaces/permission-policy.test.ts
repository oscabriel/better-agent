import assert from "node:assert/strict";
import test from "node:test";

import type { ProductDb } from "@better-agent/db";
import { user } from "@better-agent/db/schema/auth";
import { userConnectedAccounts } from "@better-agent/db/schema/connected-accounts";
import {
	THINKSPACE_PERMISSION_KINDS,
	thinkspacePermissions,
} from "@better-agent/db/schema/permissions";
import { thinkspaces } from "@better-agent/db/schema/thinkspaces";
import { eq } from "drizzle-orm";
import { createTestProductDb } from "../testing/product-db";
import type { ActiveAgentProfileRevision, ToolEnablement } from "./agent-profile";
import { revokeThinkspacePermission } from "./permissions";
import { createPermissionStorePolicy, mcpServerIdFromToolId } from "./permission-policy";
import { assembleThinkspaceTurn } from "./turn-assembly";

const OWNER_USER_ID = "user_permission_policy";
const THINKSPACE_ID = "thinkspace_permission_policy";
const OTHER_THINKSPACE_ID = "thinkspace_permission_policy_other";

const seedThinkspace = async (db: ProductDb, thinkspaceId: string) => {
	await db.insert(thinkspaces).values({
		goal: "Track upstream SDK releases.",
		id: thinkspaceId,
		ownerUserId: OWNER_USER_ID,
	});
};

const createSeededDb = async (): Promise<ProductDb> => {
	const db = createTestProductDb();

	await db.insert(user).values({
		email: "owner@example.com",
		id: OWNER_USER_ID,
		name: "Owner",
	});
	await seedThinkspace(db, THINKSPACE_ID);

	return db;
};

const mcpGrantId = (serverId: string, thinkspaceId = THINKSPACE_ID): string =>
	`thinkspace_permission_${serverId}_${thinkspaceId}`;

const grantMcpToolAccess = async (
	db: ProductDb,
	serverId: string,
	thinkspaceId = THINKSPACE_ID,
) => {
	await db.insert(thinkspacePermissions).values({
		grantedByUserId: OWNER_USER_ID,
		id: mcpGrantId(serverId, thinkspaceId),
		kind: THINKSPACE_PERMISSION_KINDS.MCP_TOOL_ACCESS,
		providerId: serverId,
		thinkspaceId,
	});
};

const connectedAccountGrantId = (catalogId: string, thinkspaceId = THINKSPACE_ID): string =>
	`thinkspace_permission_ca_${catalogId}_${thinkspaceId}`;

const grantConnectedAccountCredential = async (
	db: ProductDb,
	catalogId: string,
	thinkspaceId = THINKSPACE_ID,
) => {
	await db.insert(thinkspacePermissions).values({
		grantedByUserId: OWNER_USER_ID,
		id: connectedAccountGrantId(catalogId, thinkspaceId),
		kind: THINKSPACE_PERMISSION_KINDS.CONNECTED_ACCOUNT_CREDENTIAL,
		providerId: catalogId,
		thinkspaceId,
	});
};

const connectOwnerAccount = async (db: ProductDb, catalogId: string, userId = OWNER_USER_ID) => {
	await db.insert(userConnectedAccounts).values({
		catalogId,
		credentialType: "pat",
		encryptedCredential: "encrypted",
		externalAccountId: "octocat",
		id: `connected_account_${catalogId}_${userId}`,
		userId,
	});
};

const evaluate = (db: ProductDb, enablements: ToolEnablement[], thinkspaceId = THINKSPACE_ID) =>
	createPermissionStorePolicy({ db }).evaluateToolPotency({ enablements, thinkspaceId });

test("MCP toolIds resolve to their server id at both server and tool scope", () => {
	assert.equal(mcpServerIdFromToolId("cloudflare-docs"), "cloudflare-docs");
	assert.equal(mcpServerIdFromToolId("cloudflare-docs:search_docs"), "cloudflare-docs");
});

const BUILT_IN_GRANT_PROVIDER_ID = {
	[THINKSPACE_PERMISSION_KINDS.BUILT_IN_MEMORY_WRITE]: "memory",
	[THINKSPACE_PERMISSION_KINDS.BUILT_IN_SOURCE_READ]: "sources",
	[THINKSPACE_PERMISSION_KINDS.BUILT_IN_WEB_READ]: "web",
} as const;

type BuiltInGrantKind = keyof typeof BUILT_IN_GRANT_PROVIDER_ID;

const grantBuiltInPermission = async (
	db: ProductDb,
	kind: BuiltInGrantKind,
	thinkspaceId = THINKSPACE_ID,
) => {
	await db.insert(thinkspacePermissions).values({
		grantedByUserId: OWNER_USER_ID,
		id: `thinkspace_permission_${kind}_${thinkspaceId}`,
		kind,
		providerId: BUILT_IN_GRANT_PROVIDER_ID[kind],
		thinkspaceId,
	});
};

const ALL_BUILT_IN_ENABLEMENTS: ToolEnablement[] = [
	{ source: "built_in", toolId: "web_search" },
	{ source: "built_in", toolId: "web_fetch" },
	{ source: "built_in", toolId: "source_read" },
];

test("built-in enablements are inert with no stored grant: enablement alone never confers ability", async () => {
	const db = await createSeededDb();

	const verdicts = await evaluate(db, ALL_BUILT_IN_ENABLEMENTS);

	assert.deepEqual(verdicts, [
		{ potency: "inert", toolId: "web_search" },
		{ potency: "inert", toolId: "web_fetch" },
		{ potency: "inert", toolId: "source_read" },
	]);
});

test("a granted web reading Permission makes both web tools potent but never Source reading", async () => {
	const db = await createSeededDb();
	await grantBuiltInPermission(db, THINKSPACE_PERMISSION_KINDS.BUILT_IN_WEB_READ);

	const verdicts = await evaluate(db, ALL_BUILT_IN_ENABLEMENTS);

	assert.deepEqual(verdicts, [
		{ potency: "potent", toolId: "web_search" },
		{ potency: "potent", toolId: "web_fetch" },
		{ potency: "inert", toolId: "source_read" },
	]);
});

test("a granted Source reading Permission makes Source reading potent but never the web tools", async () => {
	const db = await createSeededDb();
	await grantBuiltInPermission(db, THINKSPACE_PERMISSION_KINDS.BUILT_IN_SOURCE_READ);

	const verdicts = await evaluate(db, ALL_BUILT_IN_ENABLEMENTS);

	assert.deepEqual(verdicts, [
		{ potency: "inert", toolId: "web_search" },
		{ potency: "inert", toolId: "web_fetch" },
		{ potency: "potent", toolId: "source_read" },
	]);
});

test("unknown built-in tool ids stay inert even with every built-in grant present", async () => {
	const db = await createSeededDb();
	await grantBuiltInPermission(db, THINKSPACE_PERMISSION_KINDS.BUILT_IN_WEB_READ);
	await grantBuiltInPermission(db, THINKSPACE_PERMISSION_KINDS.BUILT_IN_SOURCE_READ);
	await grantBuiltInPermission(db, THINKSPACE_PERMISSION_KINDS.BUILT_IN_MEMORY_WRITE);

	const verdicts = await evaluate(db, [
		{ source: "built_in", toolId: "workspace_bash" },
		{ source: "built_in", toolId: "workspace_mutate" },
	]);

	assert.deepEqual(verdicts, [
		{ potency: "inert", toolId: "workspace_bash" },
		{ potency: "inert", toolId: "workspace_mutate" },
	]);
});

test("memory_write is inert with no stored grant: enabling the held tool alone confers nothing", async () => {
	const db = await createSeededDb();

	const verdicts = await evaluate(db, [{ source: "built_in", toolId: "memory_write" }]);

	assert.deepEqual(verdicts, [{ potency: "inert", toolId: "memory_write" }]);
});

test("a granted Memory writing Permission makes memory_write potent but never the read tools", async () => {
	const db = await createSeededDb();
	await grantBuiltInPermission(db, THINKSPACE_PERMISSION_KINDS.BUILT_IN_MEMORY_WRITE);

	const verdicts = await evaluate(db, [
		{ source: "built_in", toolId: "memory_write" },
		...ALL_BUILT_IN_ENABLEMENTS,
	]);

	assert.deepEqual(verdicts, [
		{ potency: "potent", toolId: "memory_write" },
		{ potency: "inert", toolId: "web_search" },
		{ potency: "inert", toolId: "web_fetch" },
		{ potency: "inert", toolId: "source_read" },
	]);
});

test("a revoked Memory writing grant makes the still-enabled memory_write inert on the next evaluation", async () => {
	const db = await createSeededDb();
	await grantBuiltInPermission(db, THINKSPACE_PERMISSION_KINDS.BUILT_IN_MEMORY_WRITE);

	const enablements: ToolEnablement[] = [{ source: "built_in", toolId: "memory_write" }];
	const granted = await evaluate(db, enablements);
	assert.deepEqual(granted, [{ potency: "potent", toolId: "memory_write" }]);

	const revokedGrant = await revokeThinkspacePermission(db, {
		permissionId: `thinkspace_permission_${THINKSPACE_PERMISSION_KINDS.BUILT_IN_MEMORY_WRITE}_${THINKSPACE_ID}`,
		thinkspaceId: THINKSPACE_ID,
	});
	assert.ok(revokedGrant);

	const revoked = await evaluate(db, enablements);
	assert.deepEqual(revoked, [{ potency: "inert", toolId: "memory_write" }]);
});

test("built-in grants are Thinkspace-scoped: another Thinkspace's grant never leaks", async () => {
	const db = await createSeededDb();
	await seedThinkspace(db, OTHER_THINKSPACE_ID);
	await grantBuiltInPermission(
		db,
		THINKSPACE_PERMISSION_KINDS.BUILT_IN_WEB_READ,
		OTHER_THINKSPACE_ID,
	);

	const verdicts = await evaluate(db, [{ source: "built_in", toolId: "web_search" }]);

	assert.deepEqual(verdicts, [{ potency: "inert", toolId: "web_search" }]);
});

test("a revoked built-in grant makes the still-enabled tool inert on the next evaluation", async () => {
	const db = await createSeededDb();
	await grantBuiltInPermission(db, THINKSPACE_PERMISSION_KINDS.BUILT_IN_SOURCE_READ);

	const enablements: ToolEnablement[] = [{ source: "built_in", toolId: "source_read" }];
	const granted = await evaluate(db, enablements);
	assert.deepEqual(granted, [{ potency: "potent", toolId: "source_read" }]);

	const revokedGrant = await revokeThinkspacePermission(db, {
		permissionId: `thinkspace_permission_${THINKSPACE_PERMISSION_KINDS.BUILT_IN_SOURCE_READ}_${THINKSPACE_ID}`,
		thinkspaceId: THINKSPACE_ID,
	});
	assert.ok(revokedGrant);

	const revoked = await evaluate(db, enablements);
	assert.deepEqual(revoked, [{ potency: "inert", toolId: "source_read" }]);
});

test("MCP enablements are inert when no matching grant exists", async () => {
	const db = await createSeededDb();

	const verdicts = await evaluate(db, [
		{ source: "mcp_server", toolId: "cloudflare-docs" },
		{ source: "mcp_server", toolId: "aws-knowledge:search_documentation" },
	]);

	assert.deepEqual(verdicts, [
		{ potency: "inert", toolId: "cloudflare-docs" },
		{ potency: "inert", toolId: "aws-knowledge:search_documentation" },
	]);
});

test("a granted MCP tool access Permission makes that server's enablements potent", async () => {
	const db = await createSeededDb();
	await grantMcpToolAccess(db, "cloudflare-docs");

	const verdicts = await evaluate(db, [
		{ source: "mcp_server", toolId: "cloudflare-docs" },
		{ source: "mcp_server", toolId: "cloudflare-docs:search_docs" },
		{ source: "mcp_server", toolId: "aws-knowledge" },
	]);

	assert.deepEqual(verdicts, [
		{ potency: "potent", toolId: "cloudflare-docs" },
		{ potency: "potent", toolId: "cloudflare-docs:search_docs" },
		{ potency: "inert", toolId: "aws-knowledge" },
	]);
});

test("grants match on kind: a model-provider credential grant never grants MCP access", async () => {
	const db = await createSeededDb();
	await db.insert(thinkspacePermissions).values({
		grantedByUserId: OWNER_USER_ID,
		id: "thinkspace_permission_credential",
		kind: THINKSPACE_PERMISSION_KINDS.MODEL_PROVIDER_CREDENTIAL,
		providerId: "cloudflare-docs",
		thinkspaceId: THINKSPACE_ID,
	});

	const verdicts = await evaluate(db, [{ source: "mcp_server", toolId: "cloudflare-docs" }]);

	assert.deepEqual(verdicts, [{ potency: "inert", toolId: "cloudflare-docs" }]);
});

test("grants are Thinkspace-scoped: another Thinkspace's grant never leaks", async () => {
	const db = await createSeededDb();
	await seedThinkspace(db, OTHER_THINKSPACE_ID);
	await grantMcpToolAccess(db, "cloudflare-docs", OTHER_THINKSPACE_ID);

	const verdicts = await evaluate(db, [{ source: "mcp_server", toolId: "cloudflare-docs" }]);

	assert.deepEqual(verdicts, [{ potency: "inert", toolId: "cloudflare-docs" }]);
});

test("Connected Account and Local Node enablements stay inert even with grants present", async () => {
	const db = await createSeededDb();
	await grantMcpToolAccess(db, "github");

	const verdicts = await evaluate(db, [
		{ source: "connected_account", toolId: "github" },
		{ source: "local_node", toolId: "github" },
	]);

	assert.deepEqual(verdicts, [
		{ potency: "inert", toolId: "github" },
		{ potency: "inert", toolId: "github" },
	]);
});

test("a revoked grant makes the still-enabled tool inert on the next evaluation", async () => {
	const db = await createSeededDb();
	await grantMcpToolAccess(db, "cloudflare-docs");

	const enablements: ToolEnablement[] = [{ source: "mcp_server", toolId: "cloudflare-docs" }];
	const revision = {
		id: "profile_revision_revoked_grant",
		identity: { displayName: "Release Monitor", instructions: "Watch releases." },
		modelBehavior: { modelId: "google:gemini-2.5-flash-lite", reasoningLevel: "medium" },
		status: "active",
		toolEnablements: enablements,
		version: 3,
	} as unknown as ActiveAgentProfileRevision;
	const granted = await evaluate(db, enablements);
	assert.deepEqual(granted, [{ potency: "potent", toolId: "cloudflare-docs" }]);

	const revokedGrant = await revokeThinkspacePermission(db, {
		permissionId: mcpGrantId("cloudflare-docs"),
		thinkspaceId: THINKSPACE_ID,
	});
	assert.ok(revokedGrant);

	const revoked = await evaluate(db, enablements);
	const assembly = assembleThinkspaceTurn({ revision, toolPotencies: revoked });

	assert.deepEqual(revoked, [{ potency: "inert", toolId: "cloudflare-docs" }]);
	assert.deepEqual(assembly.activeTools, []);
});

test("store-backed verdicts feeding turn assembly never activate tools the revision did not enable", async () => {
	const db = await createSeededDb();
	await grantBuiltInPermission(db, THINKSPACE_PERMISSION_KINDS.BUILT_IN_WEB_READ);
	await grantMcpToolAccess(db, "cloudflare-docs");
	await grantMcpToolAccess(db, "aws-knowledge");

	const revision = {
		id: "profile_revision_active",
		identity: { displayName: "Release Monitor", instructions: "Watch releases." },
		modelBehavior: { modelId: "google:gemini-2.5-flash-lite", reasoningLevel: "medium" },
		status: "active",
		toolEnablements: [
			{ source: "built_in", toolId: "web_search" },
			{ source: "mcp_server", toolId: "cloudflare-docs" },
			{ source: "mcp_server", toolId: "microsoft-learn" },
		],
		version: 3,
	} as unknown as ActiveAgentProfileRevision;

	// The policy is asked about a superset, mimicking drift between caller
	// input and the revision; assembly must ignore the extra verdict.
	const toolPotencies = await evaluate(db, [
		...revision.toolEnablements,
		{ source: "mcp_server", toolId: "aws-knowledge" },
	]);

	const assembly = assembleThinkspaceTurn({ revision, toolPotencies });

	assert.deepEqual(assembly.activeTools, ["web_search", "cloudflare-docs"]);
});

test("a connected-account tool is inert with the grant but no connected account (credential-exists axis missing)", async () => {
	const db = await createSeededDb();
	await grantConnectedAccountCredential(db, "github");

	const verdicts = await evaluate(db, [
		{ source: "connected_account", toolId: "github:create_issue" },
	]);

	assert.deepEqual(verdicts, [{ potency: "inert", toolId: "github:create_issue" }]);
});

test("a connected-account tool is inert with a connected account but no grant (grant axis missing)", async () => {
	const db = await createSeededDb();
	await connectOwnerAccount(db, "github");

	const verdicts = await evaluate(db, [
		{ source: "connected_account", toolId: "github:create_issue" },
	]);

	assert.deepEqual(verdicts, [{ potency: "inert", toolId: "github:create_issue" }]);
});

test("a connected-account tool is potent only with grant ∩ credential; tool- and catalog-scope both resolve", async () => {
	const db = await createSeededDb();
	await grantConnectedAccountCredential(db, "github");
	await connectOwnerAccount(db, "github");

	const verdicts = await evaluate(db, [
		{ source: "connected_account", toolId: "github" },
		{ source: "connected_account", toolId: "github:create_issue" },
	]);

	assert.deepEqual(verdicts, [
		{ potency: "potent", toolId: "github" },
		{ potency: "potent", toolId: "github:create_issue" },
	]);
});

test("connected-account grants are catalog-scoped: a github grant + account never powers a gitlab tool", async () => {
	const db = await createSeededDb();
	await grantConnectedAccountCredential(db, "github");
	await connectOwnerAccount(db, "github");

	const verdicts = await evaluate(db, [
		{ source: "connected_account", toolId: "gitlab:create_issue" },
	]);

	assert.deepEqual(verdicts, [{ potency: "inert", toolId: "gitlab:create_issue" }]);
});

test("grants match on kind: an MCP grant for the same id never powers a connected-account tool", async () => {
	const db = await createSeededDb();
	await grantMcpToolAccess(db, "github");
	await connectOwnerAccount(db, "github");

	const verdicts = await evaluate(db, [{ source: "connected_account", toolId: "github" }]);

	assert.deepEqual(verdicts, [{ potency: "inert", toolId: "github" }]);
});

test("revoking the connected-account grant flips the still-enabled tool inert on the next evaluation", async () => {
	const db = await createSeededDb();
	await grantConnectedAccountCredential(db, "github");
	await connectOwnerAccount(db, "github");

	const enablements: ToolEnablement[] = [
		{ source: "connected_account", toolId: "github:create_issue" },
	];
	const granted = await evaluate(db, enablements);
	assert.deepEqual(granted, [{ potency: "potent", toolId: "github:create_issue" }]);

	const revoked = await revokeThinkspacePermission(db, {
		permissionId: connectedAccountGrantId("github"),
		thinkspaceId: THINKSPACE_ID,
	});
	assert.ok(revoked);

	const after = await evaluate(db, enablements);
	assert.deepEqual(after, [{ potency: "inert", toolId: "github:create_issue" }]);
});

test("disconnecting the account flips the still-enabled tool inert without editing the grant", async () => {
	const db = await createSeededDb();
	await grantConnectedAccountCredential(db, "github");
	await connectOwnerAccount(db, "github");

	const enablements: ToolEnablement[] = [{ source: "connected_account", toolId: "github" }];
	assert.deepEqual(await evaluate(db, enablements), [{ potency: "potent", toolId: "github" }]);

	await db.delete(userConnectedAccounts).where(eq(userConnectedAccounts.userId, OWNER_USER_ID));

	assert.deepEqual(await evaluate(db, enablements), [{ potency: "inert", toolId: "github" }]);
});

test("connected-account grants are Thinkspace-scoped even though the credential is shared by the owner", async () => {
	const db = await createSeededDb();
	await seedThinkspace(db, OTHER_THINKSPACE_ID);
	// The owner connects the account once (product-level), and grants only the
	// OTHER Thinkspace. THIS Thinkspace holds no grant, so its tool stays inert.
	await connectOwnerAccount(db, "github");
	await grantConnectedAccountCredential(db, "github", OTHER_THINKSPACE_ID);

	const verdicts = await evaluate(db, [{ source: "connected_account", toolId: "github" }]);

	assert.deepEqual(verdicts, [{ potency: "inert", toolId: "github" }]);
});
