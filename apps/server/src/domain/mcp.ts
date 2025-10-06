import type { z } from "zod";

export interface MCPServerConfig {
	id: string;
	name: string;
	url: string;
	type: "http" | "sse";
	description: string;
	headers?: Record<string, string>;
	isBuiltIn: boolean;
	schemas?: Record<string, { inputSchema: z.ZodSchema }>;
}

export interface UserMCPServer {
	id: string;
	userId: string;
	name: string;
	url: string;
	type: "http" | "sse";
	description?: string;
	headers?: Record<string, string>;
	enabled: boolean;
	created: Date;
}

export const DEFAULT_ENABLED_MCP_SERVERS = ["context7"] as const;
