export type McpTransport = "streamable_http" | "sse";
export type McpAuthType = "none" | "bearer" | "api_key_header";
export type McpRiskLevel = "read_only" | "unknown" | "mutating";

export interface BuiltInMcpServer {
	authType: McpAuthType;
	description: string;
	enabledByDefaultForThinkspaces: false;
	id: string;
	name: string;
	riskLevel: McpRiskLevel;
	transport: McpTransport;
	url: string;
}

export const BUILT_IN_MCP_SERVERS: BuiltInMcpServer[] = [
	{
		authType: "api_key_header",
		description: "Up-to-date code documentation for LLMs and AI code editors.",
		enabledByDefaultForThinkspaces: false,
		id: "context7",
		name: "Context7",
		riskLevel: "read_only",
		transport: "streamable_http",
		url: "https://mcp.context7.com/mcp",
	},
	{
		authType: "none",
		description: "Complete Cloudflare platform documentation and guides.",
		enabledByDefaultForThinkspaces: false,
		id: "cloudflare-docs",
		name: "Cloudflare Docs",
		riskLevel: "read_only",
		transport: "streamable_http",
		url: "https://docs.mcp.cloudflare.com/mcp",
	},
	{
		authType: "none",
		description:
			"AWS knowledge sources including docs, API references, and architectural guidance.",
		enabledByDefaultForThinkspaces: false,
		id: "aws-knowledge",
		name: "AWS Knowledge",
		riskLevel: "read_only",
		transport: "streamable_http",
		url: "https://knowledge-mcp.global.api.aws",
	},
	{
		authType: "none",
		description: "Microsoft Learn technical documentation and learning resources.",
		enabledByDefaultForThinkspaces: false,
		id: "microsoft-learn",
		name: "Microsoft Learn",
		riskLevel: "read_only",
		transport: "streamable_http",
		url: "https://learn.microsoft.com/api/mcp",
	},
];

export const listBuiltInMcpServers = (): BuiltInMcpServer[] => [...BUILT_IN_MCP_SERVERS];
