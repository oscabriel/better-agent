export interface CanonicalMcpToolIdentity {
	modelAlias: string;
	serverId: string;
	toolName: string;
}

const ALIAS_SAFE_CHARACTER = /[^a-zA-Z0-9_-]/gu;
const CLOUDFLARE_AGENTS_MCP_TOOL_PREFIX = "tool_";

export const createCanonicalMcpToolIdentity = (
	serverId: string,
	toolName: string,
): CanonicalMcpToolIdentity => {
	const safeServerId = serverId.replace(ALIAS_SAFE_CHARACTER, "_");
	const safeToolName = toolName.replace(ALIAS_SAFE_CHARACTER, "_");
	return {
		modelAlias: `${safeServerId}__${safeToolName}`,
		serverId,
		toolName,
	};
};

export const createCloudflareAgentsMcpToolName = (serverId: string, toolName: string): string =>
	`${CLOUDFLARE_AGENTS_MCP_TOOL_PREFIX}${serverId.replaceAll("-", "")}_${toolName}`;

export const parseCloudflareAgentsMcpToolName = (
	runtimeToolName: string,
	serverIds: readonly string[],
): CanonicalMcpToolIdentity | null => {
	const sortedServerIds = serverIds.toSorted((left, right) => right.length - left.length);

	for (const serverId of sortedServerIds) {
		const prefix = createCloudflareAgentsMcpToolName(serverId, "");

		if (runtimeToolName.startsWith(prefix)) {
			const toolName = runtimeToolName.slice(prefix.length);

			if (!toolName) {
				return null;
			}

			return createCanonicalMcpToolIdentity(serverId, toolName);
		}
	}

	return null;
};
