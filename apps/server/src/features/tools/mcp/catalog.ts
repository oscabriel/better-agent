import type { MCPServerConfig } from "./types";

export const BUILT_IN_MCP_SERVERS: MCPServerConfig[] = [
	{
		id: "context7",
		name: "Context7",
		url: "https://mcp.context7.com/mcp",
		type: "http",
		description: "Up-to-date code documentation for LLMs and AI code editors.",
		headers: {},
		isBuiltIn: true,
	},
	{
		id: "cloudflare-docs",
		name: "Cloudflare",
		url: "https://docs.mcp.cloudflare.com/sse",
		type: "sse",
		description: "Complete Cloudflare platform documentation and guides.",
		headers: {},
		isBuiltIn: true,
	},
	{
		id: "aws-knowledge",
		name: "AWS Knowledge",
		url: "https://knowledge-mcp.global.api.aws",
		type: "http",
		description:
			"AWS knowledge sources including docs, API references, and architectural guidance.",
		headers: {},
		isBuiltIn: true,
	},
	{
		id: "microsoft-learn",
		name: "MS Learn",
		url: "https://learn.microsoft.com/api/mcp",
		type: "http",
		description:
			"Microsoft Learn technical documentation and learning resources.",
		headers: {},
		isBuiltIn: true,
	},
	{
		id: "better-auth",
		name: "Better Auth",
		url: "https://mcp.chonkie.ai/better-auth/better-auth-builder/mcp",
		type: "http",
		description: "Better Auth authentication framework documentation.",
		headers: {},
		isBuiltIn: true,
	},
	{
		id: "sveltekit",
		name: "SvelteKit",
		url: "https://mcp.svelte.dev/mcp",
		type: "http",
		description:
			"Svelte 5 and SvelteKit documentation with code analysis tools.",
		headers: {},
		isBuiltIn: true,
	},
];
