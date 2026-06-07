export interface CanonicalMcpToolIdentity {
	modelAlias: string;
	serverId: string;
	toolName: string;
}

const ALIAS_SAFE_CHARACTER = /[^a-zA-Z0-9_-]/gu;

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
