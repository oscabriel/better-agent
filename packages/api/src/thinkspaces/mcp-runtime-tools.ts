import type { Tool, ToolSet } from "ai";

import type { BuiltInMcpServer } from "../mcp/catalog";
import { listBuiltInMcpServers } from "../mcp/catalog";
import {
	createCloudflareAgentsMcpToolName,
	parseCloudflareAgentsMcpToolName,
} from "../mcp/tool-identity";
import type { ActiveAgentProfileRevision, ToolEnablement } from "./agent-profile";
import type { ThinkspacePermissionPolicy } from "./permission-policy";
import { mcpServerIdFromToolId } from "./permission-policy";

export const THINKSPACE_MCP_TOOL_BLOCKED_REASON =
	"This external information tool is not currently available for this Thinkspace Agent turn.";

export interface ThinkspaceMcpRuntimePlan {
	activeProductToolIds: string[];
	servers: BuiltInMcpServer[];
}

export interface ThinkspaceMcpRuntimeDegradation {
	serverId: string;
	serverName: string;
}

export interface ThinkspaceMcpRuntimePreparation {
	activeToolNames: string[];
	connectedServerIds: string[];
	degradedServers: ThinkspaceMcpRuntimeDegradation[];
	tools: ToolSet;
}

export interface ThinkspaceMcpRuntimeToolCallDecision {
	allowed: boolean;
	applies: boolean;
	productToolId: string | null;
	reason?: string;
	serverId: string | null;
	toolName: string | null;
}

export type ConnectThinkspaceMcpRuntimeServer = (input: {
	server: BuiltInMcpServer;
}) => Promise<ToolSet>;

const unique = <T>(values: T[]): T[] => [...new Set(values)];

/**
 * Whether a granted MCP server can be connected for a turn at all. Auth-free
 * servers connect regardless of risk: a read-only server's tools run inline, a
 * mutating-risk server's tools are held for the owner's Approval (see
 * `requiresMcpApprovalHold`). Authenticated servers stay non-connectable until
 * the credential seam (ADR-0009) lands.
 */
export const isConnectableMcpServer = (server: BuiltInMcpServer): boolean =>
	server.authType === "none";

/**
 * Whether every tool on this server must be held for the owner's Approval
 * before it runs. A server that does not clearly declare itself read-only is
 * treated as mutating and held — the conservative default that keeps external
 * mutations behind the draft-or-approval holdpoint (ADR-0003).
 */
export const requiresMcpApprovalHold = (server: BuiltInMcpServer): boolean =>
	server.riskLevel !== "read_only";

/**
 * Marks every tool in a server's toolset as held for Approval: Project Think's
 * `needsApproval` parks the call in the transcript instead of executing it, so
 * a mutating MCP tool reaches the Review Queue exactly like the held
 * Memory-write and GitHub-issue tools. A constant `true` keeps the hold
 * unambiguous (fail closed).
 */
const holdToolSetForApproval = (toolSet: ToolSet): ToolSet =>
	Object.fromEntries(
		Object.entries(toolSet).map(([name, definition]) => [
			name,
			{ ...definition, needsApproval: true } as Tool,
		]),
	);

const mcpEnablementToolIds = (revision: ActiveAgentProfileRevision): Set<string> =>
	new Set(
		revision.toolEnablements
			.filter((enablement) => enablement.source === "mcp_server")
			.map((enablement) => enablement.toolId),
	);

const findBuiltInMcpServer = (
	serverId: string,
	catalog: readonly BuiltInMcpServer[],
): BuiltInMcpServer | null => catalog.find((server) => server.id === serverId) ?? null;

export const planThinkspaceMcpRuntimeTools = ({
	activeProductToolIds,
	builtInMcpServers = listBuiltInMcpServers(),
	revision,
}: {
	activeProductToolIds: string[];
	builtInMcpServers?: readonly BuiltInMcpServer[];
	revision: ActiveAgentProfileRevision;
}): ThinkspaceMcpRuntimePlan => {
	const enabledMcpToolIds = mcpEnablementToolIds(revision);
	const activeMcpToolIds = activeProductToolIds.filter((toolId) => enabledMcpToolIds.has(toolId));
	const activeServerIds = unique(activeMcpToolIds.map(mcpServerIdFromToolId));

	const servers = activeServerIds
		.map((serverId) => findBuiltInMcpServer(serverId, builtInMcpServers))
		.filter((server): server is BuiltInMcpServer =>
			Boolean(server && isConnectableMcpServer(server)),
		);
	const serverIds = new Set(servers.map((server) => server.id));

	return {
		activeProductToolIds: activeMcpToolIds.filter((toolId) =>
			serverIds.has(mcpServerIdFromToolId(toolId)),
		),
		servers,
	};
};

export const selectActiveMcpRuntimeToolNames = ({
	activeProductToolIds,
	runtimeTools,
	serverIds,
}: {
	activeProductToolIds: readonly string[];
	runtimeTools: ToolSet;
	serverIds: readonly string[];
}): string[] => {
	const activeExactToolIds = new Set(activeProductToolIds.filter((toolId) => toolId.includes(":")));
	const activeWholeServerIds = new Set(
		activeProductToolIds.filter((toolId) => !toolId.includes(":")),
	);

	return Object.keys(runtimeTools).filter((runtimeToolName) => {
		const identity = parseCloudflareAgentsMcpToolName(runtimeToolName, serverIds);

		if (!identity) {
			return false;
		}

		return (
			activeWholeServerIds.has(identity.serverId) ||
			activeExactToolIds.has(`${identity.serverId}:${identity.toolName}`)
		);
	});
};

export const prepareThinkspaceMcpRuntimeTools = async ({
	activeProductToolIds,
	connectServer,
	servers,
}: {
	activeProductToolIds: readonly string[];
	connectServer: ConnectThinkspaceMcpRuntimeServer;
	servers: readonly BuiltInMcpServer[];
}): Promise<ThinkspaceMcpRuntimePreparation> => {
	const tools: ToolSet = {};
	const connectedServerIds: string[] = [];
	const degradedServers: ThinkspaceMcpRuntimeDegradation[] = [];

	for (const server of servers) {
		try {
			const serverTools = await connectServer({ server });

			Object.assign(
				tools,
				requiresMcpApprovalHold(server) ? holdToolSetForApproval(serverTools) : serverTools,
			);
			connectedServerIds.push(server.id);
		} catch {
			degradedServers.push({ serverId: server.id, serverName: server.name });
		}
	}

	return {
		activeToolNames: selectActiveMcpRuntimeToolNames({
			activeProductToolIds,
			runtimeTools: tools,
			serverIds: connectedServerIds,
		}),
		connectedServerIds,
		degradedServers,
		tools,
	};
};

export const createThinkspaceMcpDegradationNotice = (
	degradedServers: readonly ThinkspaceMcpRuntimeDegradation[],
): string | null => {
	if (degradedServers.length === 0) {
		return null;
	}

	if (degradedServers.length === 1) {
		return "A granted external information source is temporarily unavailable for this turn. Continue with the available context, and mention the limitation briefly if it affects the answer.";
	}

	return "Some granted external information sources are temporarily unavailable for this turn. Continue with the available context, and mention the limitation briefly if it affects the answer.";
};

const matchingMcpToolCallEnablements = (
	enablements: readonly ToolEnablement[],
	serverId: string,
	toolName: string,
): ToolEnablement[] => {
	const exactToolId = `${serverId}:${toolName}`;

	return enablements.filter(
		(enablement) =>
			enablement.source === "mcp_server" &&
			(enablement.toolId === serverId || enablement.toolId === exactToolId),
	);
};

export const evaluateMcpRuntimeToolCallPermission = async ({
	builtInMcpServers = listBuiltInMcpServers(),
	permissionPolicy,
	revision,
	runtimeToolName,
	thinkspaceId,
}: {
	builtInMcpServers?: readonly BuiltInMcpServer[];
	permissionPolicy: ThinkspacePermissionPolicy;
	revision: ActiveAgentProfileRevision;
	runtimeToolName: string;
	thinkspaceId: string;
}): Promise<ThinkspaceMcpRuntimeToolCallDecision> => {
	const identity = parseCloudflareAgentsMcpToolName(
		runtimeToolName,
		builtInMcpServers.map((server) => server.id),
	);

	if (!identity) {
		return {
			allowed: true,
			applies: false,
			productToolId: null,
			serverId: null,
			toolName: null,
		};
	}

	const productToolId = `${identity.serverId}:${identity.toolName}`;
	const server = findBuiltInMcpServer(identity.serverId, builtInMcpServers);
	const enablements = matchingMcpToolCallEnablements(
		revision.toolEnablements,
		identity.serverId,
		identity.toolName,
	);

	if (!(server && isConnectableMcpServer(server) && enablements.length > 0)) {
		return {
			allowed: false,
			applies: true,
			productToolId,
			reason: THINKSPACE_MCP_TOOL_BLOCKED_REASON,
			serverId: identity.serverId,
			toolName: identity.toolName,
		};
	}

	const verdicts = await permissionPolicy.evaluateToolPotency({ enablements, thinkspaceId });
	const allowed = verdicts.some((verdict) => verdict.potency === "potent");

	return {
		allowed,
		applies: true,
		productToolId,
		reason: allowed ? undefined : THINKSPACE_MCP_TOOL_BLOCKED_REASON,
		serverId: identity.serverId,
		toolName: identity.toolName,
	};
};

export const toCloudflareAgentsMcpToolName = createCloudflareAgentsMcpToolName;
