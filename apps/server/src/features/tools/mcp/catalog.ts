import { env } from "cloudflare:workers";
import type { MCPServerConfig } from "./types";

export function getBuiltInMCPServers(): MCPServerConfig[] {
	const context7Headers: Record<string, string> = {};
	if (env.CONTEXT7_API_KEY) {
		context7Headers["X-API-Key"] = env.CONTEXT7_API_KEY;
	}

	return [
		{
			id: "context7",
			name: "Context7",
			url: "https://mcp.context7.com/mcp",
			type: "http",
			description:
				"Up-to-date code documentation for LLMs and AI code editors.",
			headers: context7Headers,
			isBuiltIn: true,
		},
		{
			id: "cloudflare-docs",
			name: "Cloudflare",
			url: "https://docs.mcp.cloudflare.com/mcp",
			type: "http",
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
}
