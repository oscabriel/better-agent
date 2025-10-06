import { and, eq } from "drizzle-orm";
import type { UserMCPServer } from "@/server/domain/mcp";
import { db } from "@/server/infra/db";
import { userMcpServers } from "@/server/infra/db/schema/settings";

function parseJson<T>(value: string | null | undefined, fallback: T): T {
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

export async function addCustomMcpServer(
	userId: string,
	server: {
		id: string;
		name: string;
		url: string;
		type: "http" | "sse";
		description?: string;
		headers?: Record<string, string>;
		enabled?: boolean;
		created?: Date;
	},
): Promise<void> {
	await db.insert(userMcpServers).values({
		id: server.id,
		userId,
		name: server.name,
		url: server.url,
		type: server.type,
		description: server.description,
		headers: JSON.stringify(server.headers ?? {}),
		enabled: server.enabled ?? true,
		createdAt: server.created ?? new Date(),
	});
}

export async function removeCustomMcpServer(
	userId: string,
	serverId: string,
): Promise<void> {
	await db
		.delete(userMcpServers)
		.where(
			and(eq(userMcpServers.id, serverId), eq(userMcpServers.userId, userId)),
		);
}

export async function toggleCustomMcpServer(
	userId: string,
	serverId: string,
	enabled: boolean,
): Promise<void> {
	await db
		.update(userMcpServers)
		.set({ enabled })
		.where(
			and(eq(userMcpServers.id, serverId), eq(userMcpServers.userId, userId)),
		);
}
