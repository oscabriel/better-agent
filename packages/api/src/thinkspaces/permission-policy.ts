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
 * and fetch, Source reading for the Source read tool (PRD #73 superseded the
 * earlier enablement-alone rule for built-ins). MCP-source enablements are
 * potent only with a matching granted MCP tool access Permission. Connected
 * Account and Local Node sources, and built-in tool ids the catalog does not
 * know, are unconditionally inert.
 */
import type { ProductDb } from "@better-agent/db";
import {
	THINKSPACE_PERMISSION_KINDS,
	thinkspacePermissions,
} from "@better-agent/db/schema/permissions";
import { and, eq, inArray } from "drizzle-orm";

import type { ToolEnablement } from "./agent-profile";
import { builtInToolPermissionKind } from "./built-in-tools";
import type { BuiltInToolPermissionKind } from "./built-in-tools";

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
	mcpServerIds: ReadonlySet<string>;
}

const isPotent = (enablement: ToolEnablement, grants: ThinkspaceToolGrants): boolean => {
	if (enablement.source === "built_in") {
		const requiredKind = builtInToolPermissionKind(enablement.toolId);

		return requiredKind !== null && grants.builtInKinds.has(requiredKind);
	}

	if (enablement.source === "mcp_server") {
		return grants.mcpServerIds.has(mcpServerIdFromToolId(enablement.toolId));
	}

	// Connected Account and Local Node tools stay inert: no grant kind for
	// them exists yet, so the system fails closed.
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
	mcpServerIds: new Set(),
};

/**
 * The decision rule with no grant lookup: useful where Permission storage is
 * out of reach (pure assembly tests) — equivalent to the store-backed policy
 * when the Thinkspace holds no grants, so every tool-governing source is
 * inert.
 */
export const createEnablementOnlyPermissionPolicy = (): ThinkspacePermissionPolicy => ({
	evaluateToolPotency: ({ enablements }) =>
		Promise.resolve(evaluateAgainstGrants(enablements, NO_GRANTS)),
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
	THINKSPACE_PERMISSION_KINDS.BUILT_IN_SOURCE_READ,
	THINKSPACE_PERMISSION_KINDS.BUILT_IN_WEB_READ,
];

const isBuiltInGrantKind = (kind: string): kind is BuiltInToolPermissionKind =>
	BUILT_IN_GRANT_KINDS.includes(kind as BuiltInToolPermissionKind);

const listThinkspaceToolGrants = async (
	db: ProductDb,
	thinkspaceId: string,
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
				]),
			),
		);

	const builtInKinds = new Set<BuiltInToolPermissionKind>();
	const mcpServerIds = new Set<string>();

	for (const row of rows) {
		if (isBuiltInGrantKind(row.kind)) {
			builtInKinds.add(row.kind);
			continue;
		}

		if (row.providerId) {
			mcpServerIds.add(row.providerId);
		}
	}

	return { builtInKinds, mcpServerIds };
};

/**
 * The real Permission-storage-backed policy: reads granted tool Permissions
 * (built-in read kinds and MCP tool access) from Thinkspace Permission
 * storage and applies the fail-closed decision rule.
 */
export const createPermissionStorePolicy = ({
	db,
}: {
	db: ProductDb;
}): ThinkspacePermissionPolicy => ({
	evaluateToolPotency: async ({ enablements, thinkspaceId }) => {
		const needsGrantLookup = enablements.some(
			(enablement) => enablement.source === "built_in" || enablement.source === "mcp_server",
		);
		const grants = needsGrantLookup ? await listThinkspaceToolGrants(db, thinkspaceId) : NO_GRANTS;

		return evaluateAgainstGrants(enablements, grants);
	},
});
