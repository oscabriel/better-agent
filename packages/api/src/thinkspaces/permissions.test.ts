import assert from "node:assert/strict";
import test from "node:test";

import { user } from "@better-agent/db/schema/auth";
import { THINKSPACE_PERMISSION_KINDS } from "@better-agent/db/schema/permissions";
import { thinkspaces } from "@better-agent/db/schema/thinkspaces";

import type { BuiltInMcpServer } from "../mcp/catalog";
import { createTestProductDb } from "../testing/product-db";
import type { McpToolAccessPermissionRequest } from "./agent-profile";
import {
	listThinkspacePermissions,
	prepareThinkspacePermissionGrants,
	revokeThinkspacePermission,
	saveThinkspacePermissionGrants,
	ThinkspacePermissionGrantError,
	toThinkspacePermissionGrant,
} from "./permissions";

const OWNER_USER_ID = "user_permission_grants";
const THINKSPACE_ID = "thinkspace_permission_grants";

const readOnlyAuthFreeServer: BuiltInMcpServer = {
	authType: "none",
	description: "Docs.",
	enabledByDefaultForThinkspaces: false,
	id: "docs",
	name: "Docs",
	riskLevel: "read_only",
	transport: "streamable_http",
	url: "https://example.com/mcp",
};

const mcpRequest = (
	overrides: Partial<McpToolAccessPermissionRequest> = {},
): McpToolAccessPermissionRequest => ({
	kind: "mcp_tool_access",
	reason: "Allow this Thinkspace Agent to read docs.",
	risk: "read_only",
	scope: { type: "server" },
	serverId: "docs",
	...overrides,
});

const grantInput = (permission = mcpRequest()) => ({
	grantedByUserId: OWNER_USER_ID,
	permission,
	thinkspaceId: THINKSPACE_ID,
});

const createSeededDb = async () => {
	const db = createTestProductDb();
	await db
		.insert(user)
		.values({ email: "grant-owner@example.com", id: OWNER_USER_ID, name: "Owner" });
	await db
		.insert(thinkspaces)
		.values({ goal: "Read docs", id: THINKSPACE_ID, ownerUserId: OWNER_USER_ID });

	return db;
};

test("model-provider credential requests still convert into credential grants", () => {
	const grant = toThinkspacePermissionGrant({
		grantedByUserId: OWNER_USER_ID,
		permission: {
			kind: "model_provider_credential",
			providerId: "google",
			reason: "Use the saved Google credential.",
		},
		thinkspaceId: THINKSPACE_ID,
	});

	assert.equal(grant?.kind, THINKSPACE_PERMISSION_KINDS.MODEL_PROVIDER_CREDENTIAL);
	assert.equal(grant?.providerId, "google");
	assert.equal(grant?.resourceScope, JSON.stringify({ type: "model_provider" }));
});

test("held Memory writing requests convert into a Memory writing grant with a stable scope", () => {
	const grant = toThinkspacePermissionGrant({
		grantedByUserId: OWNER_USER_ID,
		permission: {
			kind: THINKSPACE_PERMISSION_KINDS.BUILT_IN_MEMORY_WRITE,
			reason:
				"Allow this Thinkspace Agent to propose durable Product Memory, held for your Approval.",
		},
		thinkspaceId: THINKSPACE_ID,
	});

	assert.equal(grant?.kind, THINKSPACE_PERMISSION_KINDS.BUILT_IN_MEMORY_WRITE);
	assert.equal(grant?.providerId, "memory");
	assert.equal(grant?.resourceScope, JSON.stringify({ type: "memory_write" }));
});

test("connected-account credential requests convert into a credential grant keyed by catalog id", () => {
	const grant = toThinkspacePermissionGrant({
		grantedByUserId: OWNER_USER_ID,
		permission: {
			catalogId: "github",
			kind: "connected_account_credential",
			reason: "Allow this Thinkspace Agent to act with your connected GitHub account.",
		},
		thinkspaceId: THINKSPACE_ID,
	});

	assert.equal(grant?.kind, THINKSPACE_PERMISSION_KINDS.CONNECTED_ACCOUNT_CREDENTIAL);
	assert.equal(grant?.providerId, "github");
	assert.equal(grant?.resourceScope, JSON.stringify({ type: "connected_account_credential" }));
});

test("grantable MCP requests convert into MCP tool access grants with explicit scope", () => {
	const grant = toThinkspacePermissionGrant(grantInput(), {
		grantableMcpServers: [readOnlyAuthFreeServer],
	});

	assert.equal(grant?.kind, THINKSPACE_PERMISSION_KINDS.MCP_TOOL_ACCESS);
	assert.equal(grant?.providerId, "docs");
	assert.equal(grant?.resourceScope, JSON.stringify({ type: "server" }));
});

test("MCP grants reject servers outside the grantable catalog", () => {
	assert.throws(
		() => toThinkspacePermissionGrant(grantInput(), { grantableMcpServers: [] }),
		ThinkspacePermissionGrantError,
	);
});

test("MCP grants accept a registered server resolved into the grantable catalog", () => {
	const registeredServer: BuiltInMcpServer = {
		...readOnlyAuthFreeServer,
		id: "mcp_connection_registered",
		name: "My Registered Docs",
	};
	const grant = toThinkspacePermissionGrant(
		grantInput(mcpRequest({ serverId: "mcp_connection_registered" })),
		{ grantableMcpServers: [registeredServer] },
	);

	assert.equal(grant?.kind, THINKSPACE_PERMISSION_KINDS.MCP_TOOL_ACCESS);
	assert.equal(grant?.providerId, "mcp_connection_registered");
});

test("MCP grants accept servers requiring auth (credential enforced at runtime, not grant time)", () => {
	const bearerGrant = toThinkspacePermissionGrant(grantInput(), {
		grantableMcpServers: [{ ...readOnlyAuthFreeServer, authType: "bearer" }],
	});
	const apiKeyGrant = toThinkspacePermissionGrant(grantInput(), {
		grantableMcpServers: [{ ...readOnlyAuthFreeServer, authType: "api_key_header" }],
	});

	// The grant records the capability; whether the server actually connects is
	// gated by the credential-exists potency axis and the runtime's header
	// injection (ADR-0009), so a grant never depends on a resolvable credential.
	assert.equal(bearerGrant?.kind, THINKSPACE_PERMISSION_KINDS.MCP_TOOL_ACCESS);
	assert.equal(apiKeyGrant?.kind, THINKSPACE_PERMISSION_KINDS.MCP_TOOL_ACCESS);
});

test("MCP grants still reject unsafe server URLs", () => {
	assert.throws(
		() =>
			toThinkspacePermissionGrant(grantInput(), {
				grantableMcpServers: [{ ...readOnlyAuthFreeServer, url: "http://127.0.0.1/mcp" }],
			}),
		ThinkspacePermissionGrantError,
	);
});

test("MCP grants accept mutating and unknown-risk servers (held for Approval at runtime)", () => {
	const mutatingGrant = toThinkspacePermissionGrant(grantInput(mcpRequest({ risk: "mutating" })), {
		grantableMcpServers: [{ ...readOnlyAuthFreeServer, riskLevel: "mutating" }],
	});
	const unknownGrant = toThinkspacePermissionGrant(grantInput(mcpRequest({ risk: "unknown" })), {
		grantableMcpServers: [{ ...readOnlyAuthFreeServer, riskLevel: "unknown" }],
	});

	assert.equal(mutatingGrant?.kind, THINKSPACE_PERMISSION_KINDS.MCP_TOOL_ACCESS);
	assert.equal(unknownGrant?.kind, THINKSPACE_PERMISSION_KINDS.MCP_TOOL_ACCESS);
});

test("MCP grants keep per-Thinkspace uniqueness by kind and server id", async () => {
	const db = await createSeededDb();
	const firstGrant = prepareThinkspacePermissionGrants([grantInput()], {
		grantableMcpServers: [readOnlyAuthFreeServer],
	});
	await saveThinkspacePermissionGrants(db, firstGrant);

	const replacementGrant = prepareThinkspacePermissionGrants(
		[
			grantInput(
				mcpRequest({
					reason: "Allow one docs tool.",
					scope: { toolName: "search_docs", type: "tool" },
				}),
			),
		],
		{ grantableMcpServers: [readOnlyAuthFreeServer] },
	);
	const saved = await saveThinkspacePermissionGrants(db, replacementGrant);

	assert.equal(saved.length, 1);
	assert.equal(saved[0]?.providerId, "docs");
	assert.equal(saved[0]?.reason, "Allow one docs tool.");
	assert.equal(saved[0]?.resourceScope, JSON.stringify({ toolName: "search_docs", type: "tool" }));
});

test("revoking a Thinkspace Permission deletes only the matching grant row", async () => {
	const db = await createSeededDb();
	const [grant] = await saveThinkspacePermissionGrants(
		db,
		prepareThinkspacePermissionGrants([grantInput()], {
			grantableMcpServers: [readOnlyAuthFreeServer],
		}),
	);
	assert.ok(grant);

	const mismatchedThinkspace = await revokeThinkspacePermission(db, {
		permissionId: grant.id,
		thinkspaceId: "thinkspace_other",
	});
	assert.equal(mismatchedThinkspace, null);
	const grantsAfterMismatchedRevoke = await listThinkspacePermissions(db, {
		thinkspaceId: THINKSPACE_ID,
	});
	assert.equal(grantsAfterMismatchedRevoke.length, 1);

	const revoked = await revokeThinkspacePermission(db, {
		permissionId: grant.id,
		thinkspaceId: THINKSPACE_ID,
	});

	assert.equal(revoked?.id, grant.id);
	assert.deepEqual(await listThinkspacePermissions(db, { thinkspaceId: THINKSPACE_ID }), []);
});
