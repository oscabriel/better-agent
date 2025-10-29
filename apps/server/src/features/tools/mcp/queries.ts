import { eq } from "drizzle-orm";
import { db } from "@/server/db/d1";
import { userMcpServers } from "@/server/db/d1/schema/settings";
import { getUserSettings } from "@/server/features/settings/queries";
import { getBuiltInMCPServers } from "./catalog";
import type { MCPServerConfig, UserMCPServer } from "./types";

export function parseJson<T>(value: string | null | undefined, fallback: T): T {
	if (!value) return fallback;
	try {
		return JSON.parse(value) as T;
	} catch {
		return fallback;
	}
}

export async function getCustomMcpServers(
	userId: string,
): Promise<UserMCPServer[]> {
	const rows = await db
		.select()
		.from(userMcpServers)
		.where(eq(userMcpServers.userId, userId))
		.all();

	return rows.map((row) => ({
		id: row.id,
		userId: row.userId,
		name: row.name,
		url: row.url,
		type: (row.type as "http" | "sse") ?? "http",
		description: row.description ?? undefined,
		headers: parseJson<Record<string, string> | undefined>(
			row.headers,
			undefined,
		),
		enabled: Boolean(row.enabled ?? true),
		created:
			row.createdAt instanceof Date ? row.createdAt : new Date(row.createdAt),
	}));
}

export async function getUserMCPServers(
	userId: string,
): Promise<MCPServerConfig[]> {
	const customServers = await getCustomMcpServers(userId);
	const settings = await getUserSettings(userId);
	const enabledBuiltInIds = settings.enabledMcpServers || [];

	const enabledBuiltIn = getBuiltInMCPServers().filter((server) =>
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
