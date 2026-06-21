/**
 * Tool-selection normalization shared by every surface that shapes a draft
 * Agent Profile's enabled tools: the owner-driven `updateToolSelections`
 * procedure (router) and the Curator's propose-only `enable_tool` / `set_model`
 * tools (#127). Enabling a tool derives both its `ToolEnablement` (what makes it
 * present) and its requested `Permission` (what the owner grants at activation
 * to make it potent); this module owns that derivation once so the two callers
 * cannot drift. "Profile proposes, Permission disposes" — these functions only
 * shape draft requests; only the user grants them.
 *
 * The forward direction (selections -> enablements + requested Permissions)
 * mirrors what the owner UI sends. The inverse (`toToolSelectionSet`) recovers
 * the selection set from a draft so an incremental edit (add one tool, change
 * the model) can re-run the same forward derivation over the full set rather
 * than hand-patching the arrays. The MCP risk a `ToolEnablement` cannot carry
 * is recovered from the matching `mcp_tool_access` request, the only place it
 * survives.
 */
import { parseModelId } from "../models/catalog";
import type {
	McpToolAccessPermissionRequest,
	McpToolAccessRequestRisk,
	RequestedPermission,
	ToolEnablement,
} from "./agent-profile";
import {
	BUILT_IN_TOOL_IDS,
	createBuiltInToolPermissionRequests,
	isBuiltInToolId,
} from "./built-in-tools";
import type { BuiltInToolId } from "./built-in-tools";
import {
	CONNECTED_ACCOUNT_TOOL_IDS,
	createConnectedAccountToolPermissionRequests,
	isConnectedAccountToolId,
} from "./connected-account-tools";
import type { ConnectedAccountToolId } from "./connected-account-tools";
import { createMcpToolAccessPermissionRequest, serializeThinkspaceToolSelections } from "./policy";
import type { ThinkspaceToolSelection } from "./policy";

/** Deduped, in stable catalog order, however the caller ordered them. */
export const normalizeBuiltInToolIds = (toolIds: readonly BuiltInToolId[]): BuiltInToolId[] => {
	const requested = new Set(toolIds);

	return BUILT_IN_TOOL_IDS.filter((toolId) => requested.has(toolId));
};

/** Deduped, in stable catalog order, mirroring `normalizeBuiltInToolIds`. */
export const normalizeConnectedAccountToolIds = (
	toolIds: readonly ConnectedAccountToolId[],
): ConnectedAccountToolId[] => {
	const requested = new Set(toolIds);

	return CONNECTED_ACCOUNT_TOOL_IDS.filter((toolId) => requested.has(toolId));
};

export const toToolEnablements = (
	builtInToolIds: readonly BuiltInToolId[],
	connectedAccountToolIds: readonly ConnectedAccountToolId[],
	selections: ThinkspaceToolSelection[],
): ToolEnablement[] => {
	const normalized = JSON.parse(
		serializeThinkspaceToolSelections(selections),
	) as ThinkspaceToolSelection[];

	return [
		...builtInToolIds.map(
			(toolId): ToolEnablement => ({
				source: "built_in",
				toolId,
			}),
		),
		...connectedAccountToolIds.map(
			(toolId): ToolEnablement => ({
				source: "connected_account",
				toolId,
			}),
		),
		...normalized.map(
			(selection): ToolEnablement => ({
				source: "mcp_server",
				toolId: selection.toolName
					? `${selection.serverId}:${selection.toolName}`
					: selection.serverId,
			}),
		),
	];
};

/**
 * Every Agent Profile revision needs its model to run, so the draft always
 * requests Permission to use the owner's saved credential for that model's
 * provider. The owner grants it at activation (the default grants all requests),
 * which is what makes model resolution potent — without this grant the runtime
 * fails closed with `permission_required`. Built-in, connected-account, and MCP
 * tool requests are added on top from the user's selections.
 */
const createModelProviderCredentialPermissionRequest = (modelId: string): RequestedPermission => ({
	kind: "model_provider_credential",
	providerId: parseModelId(modelId).providerId,
	reason: "Use your saved provider credential to run this Thinkspace Agent's model.",
});

export const toRequestedPermissions = (
	modelId: string,
	builtInToolIds: readonly BuiltInToolId[],
	connectedAccountToolIds: readonly ConnectedAccountToolId[],
	selections: ThinkspaceToolSelection[],
): RequestedPermission[] => [
	createModelProviderCredentialPermissionRequest(modelId),
	...createBuiltInToolPermissionRequests(builtInToolIds),
	...createConnectedAccountToolPermissionRequests(connectedAccountToolIds),
	...selections.map((selection) => createMcpToolAccessPermissionRequest(selection)),
];

/**
 * The raw selection inputs an Agent Profile draft's tool enablement is derived
 * from — the shape `updateToolSelections` accepts and the shape
 * `toToolEnablements` / `toRequestedPermissions` consume.
 */
export interface ThinkspaceToolSelectionSet {
	builtInToolIds: BuiltInToolId[];
	connectedAccountToolIds: ConnectedAccountToolId[];
	selections: ThinkspaceToolSelection[];
}

/** Splits a `${serverId}:${toolName}` MCP enablement id; bare ids are server-scoped. */
export const parseMcpEnablementToolId = (
	toolId: string,
): { serverId: string; toolName?: string } => {
	const separatorIndex = toolId.indexOf(":");

	if (separatorIndex === -1) {
		return { serverId: toolId };
	}

	const toolName = toolId.slice(separatorIndex + 1);

	return { serverId: toolId.slice(0, separatorIndex), toolName: toolName || undefined };
};

const isMcpToolAccessRequest = (
	permission: RequestedPermission,
): permission is McpToolAccessPermissionRequest => permission.kind === "mcp_tool_access";

/**
 * An MCP `ToolEnablement` carries only the tool id; its risk lives on the
 * matching `mcp_tool_access` request. Recover it by serverId + scope, falling
 * back to the conservative `unknown` if no request matches.
 */
const recoverMcpRisk = (
	requestedPermissions: readonly RequestedPermission[],
	serverId: string,
	toolName: string | undefined,
): McpToolAccessRequestRisk => {
	const match = requestedPermissions.filter(isMcpToolAccessRequest).find((request) => {
		if (request.serverId !== serverId) {
			return false;
		}

		return toolName
			? request.scope.type === "tool" && request.scope.toolName === toolName
			: request.scope.type === "server";
	});

	return match?.risk ?? "unknown";
};

/**
 * Recovers the selection set a draft's enablements were derived from, so an
 * incremental edit can re-run the forward derivation over the full set. The
 * enablements are the source of truth for which tools are present; the requested
 * Permissions are read only to recover each MCP tool's risk. Enablement sources
 * outside the three the Curator shapes (e.g. `local_node`) are ignored.
 */
export const toToolSelectionSet = (
	enablements: readonly ToolEnablement[],
	requestedPermissions: readonly RequestedPermission[],
): ThinkspaceToolSelectionSet => {
	const builtInToolIds: BuiltInToolId[] = [];
	const connectedAccountToolIds: ConnectedAccountToolId[] = [];
	const selections: ThinkspaceToolSelection[] = [];

	for (const enablement of enablements) {
		if (enablement.source === "built_in" && isBuiltInToolId(enablement.toolId)) {
			builtInToolIds.push(enablement.toolId);
		} else if (
			enablement.source === "connected_account" &&
			isConnectedAccountToolId(enablement.toolId)
		) {
			connectedAccountToolIds.push(enablement.toolId);
		} else if (enablement.source === "mcp_server") {
			const { serverId, toolName } = parseMcpEnablementToolId(enablement.toolId);

			selections.push({
				risk: recoverMcpRisk(requestedPermissions, serverId, toolName),
				serverId,
				toolName,
			});
		}
	}

	return { builtInToolIds, connectedAccountToolIds, selections };
};
