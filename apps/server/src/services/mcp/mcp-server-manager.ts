import type { MCPServerConfig, UserMCPServer } from "@/server/domain/mcp";
import {
	addCustomMcpServer,
	getCustomMcpServers,
	removeCustomMcpServer,
	toggleCustomMcpServer,
} from "@/server/repositories/d1/mcp-repository";
import {
	getUserSettings,
	updateUserSettings,
} from "@/server/repositories/d1/settings-repository";

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
		name: "Cloudflare Docs",
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
		name: "Microsoft Learn",
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

export class MCPServerManager {
	constructor(private readonly userId: string) {}

	async getUserMCPServers(): Promise<MCPServerConfig[]> {
		const customServers = await getCustomMcpServers(this.userId);
		const settings = await getUserSettings(this.userId);
		const enabledBuiltInIds = settings.enabledMcpServers || [];

		const enabledBuiltIn = BUILT_IN_MCP_SERVERS.filter((server) =>
			enabledBuiltInIds.includes(server.id),
		);

		const enabledCustom: MCPServerConfig[] = customServers
			.filter((server) => server.enabled)
			.map((server) => ({
				id: server.id,
				name: server.name,
				url: server.url,
				type: server.type,
				description: server.description || "",
				headers: server.headers,
				isBuiltIn: false,
			}));

		return [...enabledBuiltIn, ...enabledCustom];
	}

	async getAllServers(): Promise<
		Array<MCPServerConfig | (UserMCPServer & { isBuiltIn: false })>
	> {
		const customServers = await getCustomMcpServers(this.userId);
		const settings = await getUserSettings(this.userId);
		const enabledBuiltInIds = settings.enabledMcpServers || [];

		return [
			...BUILT_IN_MCP_SERVERS.map((server) => ({
				...server,
				enabled: enabledBuiltInIds.includes(server.id),
			})),
			...customServers.map((server) => ({
				...server,
				isBuiltIn: false as const,
			})),
		];
	}

	async addCustomServer(serverData: {
		name: string;
		url: string;
		type: "http" | "sse";
		description?: string;
		headers?: Record<string, string>;
	}): Promise<string> {
		const serverId = `custom_${Date.now()}`;

		await addCustomMcpServer(this.userId, {
			id: serverId,
			name: serverData.name,
			url: serverData.url,
			type: serverData.type,
			description: serverData.description,
			headers: serverData.headers,
			enabled: true,
			created: new Date(),
		});

		return serverId;
	}

	async removeCustomServer(serverId: string): Promise<void> {
		await removeCustomMcpServer(this.userId, serverId);
	}

	async toggleServer(serverId: string, enabled: boolean): Promise<void> {
		if (serverId.startsWith("custom_")) {
			await toggleCustomMcpServer(this.userId, serverId, enabled);
		} else {
			const settings = await getUserSettings(this.userId);
			let enabledServers = settings.enabledMcpServers || [];

			if (enabled) {
				if (!enabledServers.includes(serverId)) {
					enabledServers = [...enabledServers, serverId];
				}
			} else {
				enabledServers = enabledServers.filter((id) => id !== serverId);
			}

			await updateUserSettings(this.userId, {
				enabledMcpServers: enabledServers,
			});
		}
	}
}
