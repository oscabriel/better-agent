import { and, eq } from "drizzle-orm";
import { db } from "@/server/db/d1";
import { userMcpServers } from "@/server/db/d1/schema/settings";

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
