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
import { thinkspaces } from "@better-agent/db/schema/thinkspaces";
import { and, eq, inArray } from "drizzle-orm";

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
	/** Catalog ids the Thinkspace owner has an actually-connected account for. */
	ownerConnectedAccountCatalogIds: ReadonlySet<string>;
}

const isPotent = (enablement: ToolEnablement, grants: ThinkspaceToolGrants): boolean => {
	if (enablement.source === "built_in") {
		const requiredKind = builtInToolPermissionKind(enablement.toolId);

		return requiredKind !== null && grants.builtInKinds.has(requiredKind);
	}

	if (enablement.source === "mcp_server") {
		return grants.mcpServerIds.has(mcpServerIdFromToolId(enablement.toolId));
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

/**
 * The credential-exists axis: the catalog ids the Thinkspace owner actually
 * holds a Connected Account for. Grant-scoped potency lives on the Thinkspace;
 * this lookup crosses to the owner's product-level connected accounts so a
 * granted-but-unbacked tool stays inert (and disconnecting flips it inert).
 */
const listOwnerConnectedAccountCatalogIds = async (
	db: ProductDb,
	thinkspaceId: string,
): Promise<ReadonlySet<string>> => {
	const [thinkspace] = await db
		.select({ ownerUserId: thinkspaces.ownerUserId })
		.from(thinkspaces)
		.where(eq(thinkspaces.id, thinkspaceId))
		.limit(1);

	if (!thinkspace) {
		return new Set();
	}

	const rows = await db
		.select({ catalogId: userConnectedAccounts.catalogId })
		.from(userConnectedAccounts)
		.where(eq(userConnectedAccounts.userId, thinkspace.ownerUserId));

	const catalogIds = new Set<string>();
	for (const row of rows) {
		if (row.catalogId) {
			catalogIds.add(row.catalogId);
		}
	}

	return catalogIds;
};

const listThinkspaceToolGrants = async (
	db: ProductDb,
	thinkspaceId: string,
	options: { includeOwnerConnectedAccounts: boolean },
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

	const ownerConnectedAccountCatalogIds = options.includeOwnerConnectedAccounts
		? await listOwnerConnectedAccountCatalogIds(db, thinkspaceId)
		: new Set<string>();

	return {
		builtInKinds,
		connectedAccountGrantCatalogIds,
		mcpServerIds,
		ownerConnectedAccountCatalogIds,
	};
};

/**
 * The real Permission-storage-backed policy: reads granted tool Permissions
 * (built-in read kinds, MCP tool access, and connected-account credential)
 * from Thinkspace Permission storage — plus the owner's connected accounts for
 * the credential-exists axis — and applies the fail-closed decision rule.
 */
export const createPermissionStorePolicy = ({
	db,
}: {
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
		const grants = await listThinkspaceToolGrants(db, thinkspaceId, {
			includeOwnerConnectedAccounts,
		});

		return evaluateAgainstGrants(enablements, grants);
	},
});
