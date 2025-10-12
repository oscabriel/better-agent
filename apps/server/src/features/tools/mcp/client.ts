import {
	StreamableHTTPClientTransport,
	type StreamableHTTPClientTransportOptions,
} from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { experimental_createMCPClient as createMCPClient } from "ai";
import type { MCPServerConfig } from "./types";

function normalizeSchema(schema: unknown): unknown {
	if (!schema || typeof schema !== "object") {
		return schema;
	}

	const normalized = { ...schema } as Record<string, unknown>;

	// Handle AI SDK schema wrapper (has 'jsonSchema' property)
	if (normalized.jsonSchema && typeof normalized.jsonSchema === "object") {
		normalized.jsonSchema = normalizeSchema(normalized.jsonSchema);
		return normalized;
	}

	if (normalized.type === "array" && !normalized.items) {
		normalized.items = {};
	}

	// Convert anyOf/oneOf with const values to enum (Gemini doesn't support anyOf/const)
	// Example: anyOf: [{ const: "4" }, { const: "5" }] -> type: "string", enum: ["4", "5"]
	for (const key of ["anyOf", "any_of", "oneOf", "one_of"]) {
		if (normalized[key] && Array.isArray(normalized[key])) {
			const options = normalized[key] as Array<Record<string, unknown>>;

			// Check if all options are const values
			const allConst = options.every(
				(opt) =>
					typeof opt === "object" &&
					opt !== null &&
					"const" in opt &&
					Object.keys(opt).length === 1,
			);

			if (allConst) {
				// Extract unique const values and convert to strings
				const enumValues = [
					...new Set(
						options.map((opt) => String((opt as { const: unknown }).const)),
					),
				];

				// Replace anyOf/oneOf with enum
				delete normalized[key];
				normalized.type = "string";
				normalized.enum = enumValues;
			} else {
				// Recursively normalize each option
				normalized[key] = options.map((subSchema) =>
					normalizeSchema(subSchema),
				);
			}
		}
	}

	// Handle allOf (still needs recursive normalization)
	for (const key of ["allOf", "all_of"]) {
		if (normalized[key] && Array.isArray(normalized[key])) {
			normalized[key] = (normalized[key] as unknown[]).map((subSchema) =>
				normalizeSchema(subSchema),
			);
		}
	}

	// Convert numeric enum values to strings for Google models compatibility
	if (normalized.enum && Array.isArray(normalized.enum)) {
		normalized.enum = normalized.enum.map((value) => String(value));
		// Ensure type is specified when enum is present
		if (!normalized.type) {
			normalized.type = "string";
		}
	}

	// Convert const to enum (Gemini doesn't support const)
	if (normalized.const !== undefined) {
		const constValue = String(normalized.const);
		delete normalized.const;
		normalized.type = "string";
		normalized.enum = [constValue];
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
				if (typeof tool === "object" && tool !== null) {
					const toolObj = tool as Record<string, unknown>;
					// MCP uses 'inputSchema', AI SDK uses 'parameters'
					const schemaKey = toolObj.inputSchema ? "inputSchema" : "parameters";
					const normalizedTool = {
						...toolObj,
						[schemaKey]: normalizeSchema(toolObj[schemaKey]),
					};
					prefixedTools[`${serverId}_${toolName}`] = normalizedTool;
				} else {
					prefixedTools[`${serverId}_${toolName}`] = tool;
				}
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
