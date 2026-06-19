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

import type { ConnectedAccountCredentialPermissionRequest } from "./agent-profile";

/**
 * The held GitHub-issue tool's **product tool id**, in the locked
 * `${catalogId}:${toolName}` convention. The runtime tool factory's name for it
 * (`create_github_issue`) and its `ai` dependency live in
 * `connected-account-runtime-tools.ts`; this id lives here, in the `ai`-free
 * catalog mapper, so the equip surface (the router's selection enum, the
 * profile editor) can reference it without pulling the runtime tool in.
 */
export const CREATE_GITHUB_ISSUE_TOOL_ID = "github:create_issue" as const;

/**
 * The connected-account product tool ids a Thinkspace can equip — the source
 * of truth mirrored by `EXTERNAL_MUTATION_TOOL_IDS` in the runtime tools, in
 * the same role `BUILT_IN_TOOL_IDS` plays for built-ins.
 */
export const CONNECTED_ACCOUNT_TOOL_IDS = [CREATE_GITHUB_ISSUE_TOOL_ID] as const;

export type ConnectedAccountToolId = (typeof CONNECTED_ACCOUNT_TOOL_IDS)[number];

export const isConnectedAccountToolId = (value: string): value is ConnectedAccountToolId =>
	CONNECTED_ACCOUNT_TOOL_IDS.includes(value as ConnectedAccountToolId);

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

const CONNECTED_ACCOUNT_PERMISSION_REASONS: Readonly<Record<string, string>> = {
	github:
		"Allow this Thinkspace Agent to act with your connected GitHub account — for example, to create an issue you approve.",
};

const DEFAULT_CONNECTED_ACCOUNT_PERMISSION_REASON =
	"Allow this Thinkspace Agent to act with this connected account, held for your Approval.";

/**
 * One `connected_account_credential` Permission request per catalog id, however
 * many of that catalog's tools are enabled — mirroring
 * `createBuiltInToolPermissionRequests`. The request grants the Thinkspace the
 * use of the owner's product-level credential; potency still also requires the
 * account to be connected (credential-exists, PRD #108).
 */
export const createConnectedAccountToolPermissionRequests = (
	toolIds: readonly string[],
): ConnectedAccountCredentialPermissionRequest[] => {
	const catalogIds = new Set<string>();

	for (const toolId of toolIds) {
		const catalogId = connectedAccountCatalogIdFromToolId(toolId);

		if (catalogId) {
			catalogIds.add(catalogId);
		}
	}

	return [...catalogIds].map((catalogId) => ({
		catalogId,
		kind: "connected_account_credential",
		reason:
			CONNECTED_ACCOUNT_PERMISSION_REASONS[catalogId] ??
			DEFAULT_CONNECTED_ACCOUNT_PERMISSION_REASON,
	}));
};
