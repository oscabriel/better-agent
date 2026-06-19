/**
 * The connected-account tool catalog mapper.
 *
 * Connected-account tools are a first-class tool source beside built-ins and
 * MCP: an Agent Profile revision makes one present with a stable tool id, and
 * a Thinkspace-owned `connected_account_credential` Permission — plus an
 * actually-connected account — makes it potent (PRD #108, ADR-0009). Every
 * connected-account tool is governed by the one credential kind, keyed by the
 * connected_account_catalog id, exactly as every MCP tool is governed by
 * `mcp_tool_access` keyed by server id.
 */
import { THINKSPACE_PERMISSION_KINDS } from "@better-agent/db/schema/permissions";

export type ConnectedAccountToolPermissionKind =
	typeof THINKSPACE_PERMISSION_KINDS.CONNECTED_ACCOUNT_CREDENTIAL;

/**
 * A connected-account tool id is `${catalogId}:${toolName}` (one tool) or
 * `${catalogId}` (the catalog as a whole), mirroring the MCP `serverId:tool`
 * convention. The Permission and the backing credential are both keyed by the
 * catalog id, so matching happens on it.
 */
export const connectedAccountCatalogIdFromToolId = (toolId: string): string => {
	const [catalogId] = toolId.split(":");

	return catalogId ?? toolId;
};

/**
 * Which Permission kind governs a connected-account tool. There is one kind for
 * all of them; an empty tool id maps to nothing so callers fail closed.
 */
export const connectedAccountToolPermissionKind = (
	toolId: string,
): ConnectedAccountToolPermissionKind | null =>
	toolId.length > 0 ? THINKSPACE_PERMISSION_KINDS.CONNECTED_ACCOUNT_CREDENTIAL : null;
