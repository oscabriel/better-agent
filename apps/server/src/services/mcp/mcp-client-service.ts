import {
	StreamableHTTPClientTransport,
	type StreamableHTTPClientTransportOptions,
} from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { experimental_createMCPClient as createMCPClient } from "ai";
import type { MCPServerConfig } from "@/server/domain/mcp";

function normalizeSchema(schema: unknown): unknown {
	if (!schema || typeof schema !== "object") {
		return schema;
	}

	const normalized = { ...schema } as Record<string, unknown>;

	if (normalized.type === "array" && !normalized.items) {
		normalized.items = {};
	}

	if (normalized.properties && typeof normalized.properties === "object") {
		const props = { ...(normalized.properties as Record<string, unknown>) };
		for (const [key, value] of Object.entries(props)) {
			props[key] = normalizeSchema(value);
		}
		normalized.properties = props;
	}

	if (normalized.items && typeof normalized.items === "object") {
		normalized.items = normalizeSchema(normalized.items);
	}

	if (
		normalized.additionalProperties &&
		typeof normalized.additionalProperties === "object"
	) {
		normalized.additionalProperties = normalizeSchema(
			normalized.additionalProperties,
		);
	}

	return normalized;
}

export async function createMCPClients(serverConfigs: MCPServerConfig[]) {
	const clients = new Map<
		string,
		{
			client: Awaited<ReturnType<typeof createMCPClient>>;
			config: MCPServerConfig;
		}
	>();

	for (const serverConfig of serverConfigs) {
		try {
			const headers = serverConfig.headers;
			let transport:
				| {
						type: "sse";
						url: string;
						headers?: Record<string, string>;
				  }
				| StreamableHTTPClientTransport;

			if (serverConfig.type === "http") {
				const transportOptions:
					| StreamableHTTPClientTransportOptions
					| undefined =
					headers && Object.keys(headers).length > 0
						? { requestInit: { headers } }
						: undefined;
				transport = new StreamableHTTPClientTransport(
					new URL(serverConfig.url),
					transportOptions,
				);
			} else {
				transport = {
					type: "sse",
					url: serverConfig.url,
					headers,
				};
			}

			const client = await createMCPClient({ transport });
			clients.set(serverConfig.id, { client, config: serverConfig });
		} catch (error) {
			console.error(
				`Failed to connect to MCP server ${serverConfig.name}:`,
				error,
			);
		}
	}

	return clients;
}

export async function getMCPTools(serverConfigs: MCPServerConfig[]) {
	const clients = await createMCPClients(serverConfigs);
	const allTools: Record<string, unknown> = {};

	for (const [serverId, { client, config }] of clients) {
		try {
			let tools: Record<string, unknown>;
			if (config.schemas) {
				tools = await client.tools({ schemas: config.schemas });
			} else {
				tools = await client.tools();
			}

			const prefixedTools: Record<string, unknown> = {};
			for (const [toolName, tool] of Object.entries(tools)) {
				const normalizedTool =
					typeof tool === "object" && tool !== null
						? {
								...(tool as Record<string, unknown>),
								parameters: normalizeSchema(
									(tool as Record<string, unknown>).parameters,
								),
							}
						: tool;
				prefixedTools[`${serverId}_${toolName}`] = normalizedTool;
			}

			Object.assign(allTools, prefixedTools);
		} catch (error) {
			console.error(
				`Failed to load tools from MCP server ${config.name}:`,
				error,
			);
		}
	}

	return { tools: allTools, clients };
}

export async function closeMCPClients(
	clients: Map<
		string,
		{
			client: Awaited<ReturnType<typeof createMCPClient>>;
			config: MCPServerConfig;
		}
	>,
) {
	for (const [serverId, { client }] of clients) {
		try {
			await client.close();
		} catch (error) {
			console.error(`Failed to close MCP client ${serverId}:`, error);
		}
	}
}
