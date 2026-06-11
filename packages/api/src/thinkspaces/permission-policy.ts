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
 * Decision rule (fails closed): built-in-source enablements are potent on
 * enablement alone; MCP-source enablements are potent only with a matching
 * granted MCP tool access Permission in Thinkspace Permission storage;
 * Connected Account and Local Node sources are unconditionally inert in this
 * slice.
 */
import type { ProductDb } from "@better-agent/db";
import {
	THINKSPACE_PERMISSION_KINDS,
	thinkspacePermissions,
} from "@better-agent/db/schema/permissions";
import { and, eq } from "drizzle-orm";

import type { ToolEnablement } from "./agent-profile";

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

const isPotent = (
	enablement: ToolEnablement,
	grantedMcpServerIds: ReadonlySet<string>,
): boolean => {
	if (enablement.source === "built_in") {
		return true;
	}

	if (enablement.source === "mcp_server") {
		return grantedMcpServerIds.has(mcpServerIdFromToolId(enablement.toolId));
	}

	// Connected Account and Local Node tools stay inert: no grant kind for
	// them exists yet, so the system fails closed.
	return false;
};

const evaluateAgainstGrants = (
	enablements: ToolEnablement[],
	grantedMcpServerIds: ReadonlySet<string>,
): ToolPotencyVerdict[] =>
	enablements.map((enablement) => ({
		potency: isPotent(enablement, grantedMcpServerIds) ? "potent" : "inert",
		toolId: enablement.toolId,
	}));

const NO_GRANTS: ReadonlySet<string> = new Set();

/**
 * Source-default rule with no grant lookup: useful where Permission storage
 * is out of reach (pure assembly tests) — equivalent to the store-backed
 * policy when no MCP grant exists.
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

const listGrantedMcpServerIds = async (
	db: ProductDb,
	thinkspaceId: string,
): Promise<ReadonlySet<string>> => {
	const rows = await db
		.select({ serverId: thinkspacePermissions.providerId })
		.from(thinkspacePermissions)
		.where(
			and(
				eq(thinkspacePermissions.thinkspaceId, thinkspaceId),
				eq(thinkspacePermissions.kind, THINKSPACE_PERMISSION_KINDS.MCP_TOOL_ACCESS),
			),
		);

	const grantedServerIds: string[] = [];

	for (const row of rows) {
		if (row.serverId) {
			grantedServerIds.push(row.serverId);
		}
	}

	return new Set(grantedServerIds);
};

/**
 * The real Permission-storage-backed policy: reads granted MCP tool access
 * Permissions from Thinkspace Permission storage and applies the
 * source-default rule to everything else.
 */
export const createPermissionStorePolicy = ({
	db,
}: {
	db: ProductDb;
}): ThinkspacePermissionPolicy => ({
	evaluateToolPotency: async ({ enablements, thinkspaceId }) => {
		const needsGrantLookup = enablements.some((enablement) => enablement.source === "mcp_server");
		const grantedMcpServerIds = needsGrantLookup
			? await listGrantedMcpServerIds(db, thinkspaceId)
			: NO_GRANTS;

		return evaluateAgainstGrants(enablements, grantedMcpServerIds);
	},
});
