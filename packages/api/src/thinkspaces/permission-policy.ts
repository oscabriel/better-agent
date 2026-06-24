/**
 * Permission policy seam.
 *
 * "Enablement makes a tool present; a Permission makes it potent." The Agent
 * Profile decides presence; this seam decides potency, owned by the
 * Thinkspace. It is consulted in two places: turn assembly (which enabled
 * tools become active) and the runtime adapter's beforeToolCall enforcement
 * layer. Revoking a Permission never edits the Profile — the tool simply
 * goes inert.
 *
 * Decision rule (fails closed): built-in enablements are potent only with a
 * granted Permission of their governing kind — web reading for web search
 * and fetch, Source reading for the Source read tool, Memory writing for the
 * held Memory-proposing tool (PRD #73 superseded the earlier enablement-alone
 * rule for built-ins; PRD #92 added the held Memory write). MCP-source
 * enablements are potent only with a matching granted MCP tool access
 * Permission. Connected-account enablements are potent only with both a
 * granted connected_account_credential Permission for the tool's catalog id
 * and an actually-connected account backing it (enable ∩ grant ∩
 * credential-exists; PRD #108, ADR-0009). Local Node sources, and built-in
 * tool ids the catalog does not know, are unconditionally inert.
 */
import type { ProductDb } from "@better-agent/db";
import { userConnectedAccounts } from "@better-agent/db/schema/connected-accounts";
import {
	THINKSPACE_PERMISSION_KINDS,
	thinkspacePermissions,
} from "@better-agent/db/schema/permissions";
import { userMcpConnections } from "@better-agent/db/schema/settings";
import { thinkspaces } from "@better-agent/db/schema/thinkspaces";
import { and, eq, inArray } from "drizzle-orm";

import { listBuiltInMcpServers } from "../mcp/catalog";
import type { ToolEnablement } from "./agent-profile";
import { builtInToolPermissionKind } from "./built-in-tools";
import type { BuiltInToolPermissionKind } from "./built-in-tools";
import { connectedAccountCatalogIdFromToolId } from "./connected-account-tools";

export type ToolPotency = "potent" | "inert";

export interface ToolPotencyVerdict {
	potency: ToolPotency;
	toolId: string;
}

export interface EvaluateToolPotencyInput {
	enablements: ToolEnablement[];
	thinkspaceId: string;
}

export interface ThinkspacePermissionPolicy {
	evaluateToolPotency: (input: EvaluateToolPotencyInput) => Promise<ToolPotencyVerdict[]>;
}

/**
 * An MCP enablement's toolId is `${serverId}:${toolName}` (one tool) or
 * `${serverId}` (the whole server) — see the Thinkspace router's tool
 * selection mapping. The grant is recorded at server scope, so matching
 * happens on the server id.
 */
export const mcpServerIdFromToolId = (toolId: string): string => {
	const [serverId] = toolId.split(":");

	return serverId ?? toolId;
};

interface ThinkspaceToolGrants {
	builtInKinds: ReadonlySet<BuiltInToolPermissionKind>;
	/** Catalog ids the Thinkspace holds a connected_account_credential grant for. */
	connectedAccountGrantCatalogIds: ReadonlySet<string>;
	mcpServerIds: ReadonlySet<string>;
	/**
	 * Granted MCP server ids whose credential requirement is not satisfied: an
	 * authed server (built-in `api_key_header`/`bearer`, or a registered
	 * connection carrying secret headers) with no resolvable credential, plus
	 * any granted server that no longer resolves to a built-in or a current
	 * connection (fail closed). These stay inert even though the grant exists —
	 * the MCP arm of the credential-exists axis (ADR-0009).
	 */
	mcpUncredentialedServerIds: ReadonlySet<string>;
	/** Catalog ids the Thinkspace owner has an actually-connected account for. */
	ownerConnectedAccountCatalogIds: ReadonlySet<string>;
}

const isPotent = (enablement: ToolEnablement, grants: ThinkspaceToolGrants): boolean => {
	if (enablement.source === "built_in") {
		const requiredKind = builtInToolPermissionKind(enablement.toolId);

		return requiredKind !== null && grants.builtInKinds.has(requiredKind);
	}

	if (enablement.source === "mcp_server") {
		// enable ∩ grant ∩ credential-exists: the Thinkspace must be granted the
		// server, and an authed server must have a resolvable credential backing
		// it (auth-free servers need none).
		const serverId = mcpServerIdFromToolId(enablement.toolId);

		return grants.mcpServerIds.has(serverId) && !grants.mcpUncredentialedServerIds.has(serverId);
	}

	if (enablement.source === "connected_account") {
		// enable ∩ grant ∩ credential-exists: the Thinkspace must be granted the
		// catalog and the owner must actually have a connected account for it.
		const catalogId = connectedAccountCatalogIdFromToolId(enablement.toolId);

		return (
			grants.connectedAccountGrantCatalogIds.has(catalogId) &&
			grants.ownerConnectedAccountCatalogIds.has(catalogId)
		);
	}

	// Local Node tools stay inert: no grant kind for them exists yet, so the
	// system fails closed.
	return false;
};

const evaluateAgainstGrants = (
	enablements: ToolEnablement[],
	grants: ThinkspaceToolGrants,
): ToolPotencyVerdict[] =>
	enablements.map((enablement) => ({
		potency: isPotent(enablement, grants) ? "potent" : "inert",
		toolId: enablement.toolId,
	}));

const NO_GRANTS: ThinkspaceToolGrants = {
	builtInKinds: new Set(),
	connectedAccountGrantCatalogIds: new Set(),
	mcpServerIds: new Set(),
	mcpUncredentialedServerIds: new Set(),
	ownerConnectedAccountCatalogIds: new Set(),
};

/**
 * The fail-closed decision rule applied with no grants, synchronously. Because
 * a Thinkspace that holds no grants leaves every Permission-governed source
 * inert, this answers a static question without touching Permission storage:
 * "would this tool be potent on enablement alone?" — i.e. read-only
 * (enablement-only) vs needs-Permission. A draft under curation holds no grants,
 * so the Curator card badges its enabled tools from exactly this rule rather
 * than hand-classifying sources.
 */
export const evaluateEnablementOnlyToolPotency = (
	enablements: ToolEnablement[],
): ToolPotencyVerdict[] => evaluateAgainstGrants(enablements, NO_GRANTS);

/**
 * The decision rule with no grant lookup: useful where Permission storage is
 * out of reach (pure assembly tests) — equivalent to the store-backed policy
 * when the Thinkspace holds no grants, so every tool-governing source is
 * inert.
 */
export const createEnablementOnlyPermissionPolicy = (): ThinkspacePermissionPolicy => ({
	evaluateToolPotency: ({ enablements }) =>
		Promise.resolve(evaluateEnablementOnlyToolPotency(enablements)),
});

/** Test adapter with caller-chosen verdicts per tool id. */
export const createMemoryPermissionPolicy = (
	potencies: Record<string, ToolPotency>,
): ThinkspacePermissionPolicy => ({
	evaluateToolPotency: ({ enablements }) =>
		Promise.resolve(
			enablements.map((enablement) => ({
				potency: potencies[enablement.toolId] ?? "inert",
				toolId: enablement.toolId,
			})),
		),
});

const BUILT_IN_GRANT_KINDS: readonly BuiltInToolPermissionKind[] = [
	THINKSPACE_PERMISSION_KINDS.BUILT_IN_MEMORY_WRITE,
	THINKSPACE_PERMISSION_KINDS.BUILT_IN_SOURCE_READ,
	THINKSPACE_PERMISSION_KINDS.BUILT_IN_WEB_READ,
];

const isBuiltInGrantKind = (kind: string): kind is BuiltInToolPermissionKind =>
	BUILT_IN_GRANT_KINDS.includes(kind as BuiltInToolPermissionKind);

const resolveThinkspaceOwnerUserId = async (
	db: ProductDb,
	thinkspaceId: string,
): Promise<string | null> => {
	const [thinkspace] = await db
		.select({ ownerUserId: thinkspaces.ownerUserId })
		.from(thinkspaces)
		.where(eq(thinkspaces.id, thinkspaceId))
		.limit(1);

	return thinkspace?.ownerUserId ?? null;
};

/**
 * The credential-exists axis: the catalog ids the Thinkspace owner actually
 * holds a Connected Account for. Grant-scoped potency lives on the Thinkspace;
 * this lookup crosses to the owner's product-level connected accounts so a
 * granted-but-unbacked tool stays inert (and disconnecting flips it inert).
 */
const listOwnerConnectedAccountCatalogIds = async (
	db: ProductDb,
	ownerUserId: string,
): Promise<ReadonlySet<string>> => {
	const rows = await db
		.select({ catalogId: userConnectedAccounts.catalogId })
		.from(userConnectedAccounts)
		.where(eq(userConnectedAccounts.userId, ownerUserId));

	const catalogIds = new Set<string>();
	for (const row of rows) {
		if (row.catalogId) {
			catalogIds.add(row.catalogId);
		}
	}

	return catalogIds;
};

interface McpConnectionCredentialState {
	authType: string;
	hasHeaders: boolean;
}

const listOwnerMcpConnectionCredentialState = async (
	db: ProductDb,
	ownerUserId: string,
): Promise<ReadonlyMap<string, McpConnectionCredentialState>> => {
	const rows = await db
		.select({
			authType: userMcpConnections.authType,
			encryptedHeaders: userMcpConnections.encryptedHeaders,
			id: userMcpConnections.id,
		})
		.from(userMcpConnections)
		.where(eq(userMcpConnections.userId, ownerUserId));

	return new Map(
		rows.map((row) => [
			row.id,
			{ authType: row.authType, hasHeaders: row.encryptedHeaders !== "{}" },
		]),
	);
};

/**
 * The MCP arm of the credential-exists axis. A granted server is uncredentialed
 * — and so stays inert despite the grant — when it needs auth but no credential
 * resolves: a built-in authed server with no product key, a registered authed
 * connection (or any header-bearing connection) whose headers were cleared, or
 * a grant whose server no longer resolves at all (deleted connection). Auth-free
 * built-ins and connections need no credential and are never blocked here.
 */
const listMcpUncredentialedServerIds = (
	grantedMcpServerIds: ReadonlySet<string>,
	connectionState: ReadonlyMap<string, McpConnectionCredentialState>,
	credentialedBuiltInMcpServerIds: ReadonlySet<string>,
): ReadonlySet<string> => {
	const builtInById = new Map(listBuiltInMcpServers().map((server) => [server.id, server]));
	const uncredentialed = new Set<string>();

	for (const serverId of grantedMcpServerIds) {
		const builtIn = builtInById.get(serverId);
		if (builtIn) {
			if (builtIn.authType !== "none" && !credentialedBuiltInMcpServerIds.has(serverId)) {
				uncredentialed.add(serverId);
			}
			continue;
		}

		const connection = connectionState.get(serverId);
		if (connection) {
			const needsCredential = connection.authType !== "none" || connection.hasHeaders;
			if (needsCredential && !connection.hasHeaders) {
				uncredentialed.add(serverId);
			}
			continue;
		}

		// Granted but unresolvable (e.g. a deleted connection): fail closed.
		uncredentialed.add(serverId);
	}

	return uncredentialed;
};

const listThinkspaceToolGrants = async (
	db: ProductDb,
	thinkspaceId: string,
	options: {
		credentialedBuiltInMcpServerIds: ReadonlySet<string>;
		includeMcpCredentials: boolean;
		includeOwnerConnectedAccounts: boolean;
	},
): Promise<ThinkspaceToolGrants> => {
	const rows = await db
		.select({
			kind: thinkspacePermissions.kind,
			providerId: thinkspacePermissions.providerId,
		})
		.from(thinkspacePermissions)
		.where(
			and(
				eq(thinkspacePermissions.thinkspaceId, thinkspaceId),
				inArray(thinkspacePermissions.kind, [
					...BUILT_IN_GRANT_KINDS,
					THINKSPACE_PERMISSION_KINDS.MCP_TOOL_ACCESS,
					THINKSPACE_PERMISSION_KINDS.CONNECTED_ACCOUNT_CREDENTIAL,
				]),
			),
		);

	const builtInKinds = new Set<BuiltInToolPermissionKind>();
	const mcpServerIds = new Set<string>();
	const connectedAccountGrantCatalogIds = new Set<string>();

	for (const row of rows) {
		if (isBuiltInGrantKind(row.kind)) {
			builtInKinds.add(row.kind);
			continue;
		}

		if (!row.providerId) {
			continue;
		}

		if (row.kind === THINKSPACE_PERMISSION_KINDS.CONNECTED_ACCOUNT_CREDENTIAL) {
			connectedAccountGrantCatalogIds.add(row.providerId);
			continue;
		}

		mcpServerIds.add(row.providerId);
	}

	const ownerUserId =
		options.includeOwnerConnectedAccounts || options.includeMcpCredentials
			? await resolveThinkspaceOwnerUserId(db, thinkspaceId)
			: null;

	const ownerConnectedAccountCatalogIds =
		options.includeOwnerConnectedAccounts && ownerUserId
			? await listOwnerConnectedAccountCatalogIds(db, ownerUserId)
			: new Set<string>();

	const mcpUncredentialedServerIds = options.includeMcpCredentials
		? listMcpUncredentialedServerIds(
				mcpServerIds,
				ownerUserId
					? await listOwnerMcpConnectionCredentialState(db, ownerUserId)
					: new Map(),
				options.credentialedBuiltInMcpServerIds,
			)
		: new Set<string>();

	return {
		builtInKinds,
		connectedAccountGrantCatalogIds,
		mcpServerIds,
		mcpUncredentialedServerIds,
		ownerConnectedAccountCatalogIds,
	};
};

/**
 * The real Permission-storage-backed policy: reads granted tool Permissions
 * (built-in read kinds, MCP tool access, and connected-account credential)
 * from Thinkspace Permission storage — plus the owner's connected accounts and
 * MCP connection credentials for the credential-exists axis — and applies the
 * fail-closed decision rule.
 *
 * `credentialedBuiltInMcpServerIds` is the set of built-in authed MCP servers
 * (e.g. `context7`) the deploy actually has a product key for. Built-ins have
 * no per-user secret store, so the caller — which holds the runtime env —
 * supplies which ones are credentialed; registered connections resolve their
 * own credential from stored headers. It defaults to empty, so a caller without
 * env access (e.g. inspect-only badging) treats built-in authed servers as
 * uncredentialed, which fails closed.
 */
export const createPermissionStorePolicy = ({
	credentialedBuiltInMcpServerIds = new Set<string>(),
	db,
}: {
	credentialedBuiltInMcpServerIds?: ReadonlySet<string>;
	db: ProductDb;
}): ThinkspacePermissionPolicy => ({
	evaluateToolPotency: async ({ enablements, thinkspaceId }) => {
		const needsGrantLookup = enablements.some(
			(enablement) =>
				enablement.source === "built_in" ||
				enablement.source === "mcp_server" ||
				enablement.source === "connected_account",
		);

		if (!needsGrantLookup) {
			return evaluateAgainstGrants(enablements, NO_GRANTS);
		}

		const includeOwnerConnectedAccounts = enablements.some(
			(enablement) => enablement.source === "connected_account",
		);
		const includeMcpCredentials = enablements.some(
			(enablement) => enablement.source === "mcp_server",
		);
		const grants = await listThinkspaceToolGrants(db, thinkspaceId, {
			credentialedBuiltInMcpServerIds,
			includeMcpCredentials,
			includeOwnerConnectedAccounts,
		});

		return evaluateAgainstGrants(enablements, grants);
	},
});
