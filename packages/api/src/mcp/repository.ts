import type { ProductDb } from "@better-agent/db";
import { schema } from "@better-agent/db";
import { and, eq } from "drizzle-orm";

export interface CustomMcpConnectionInput {
	description?: string;
	encryptedHeaders: string;
	id: string;
	name: string;
	transport: "streamable_http" | "sse";
	url: string;
	userId: string;
}

export const createCustomMcpConnection = async (db: ProductDb, input: CustomMcpConnectionInput) => {
	const [created] = await db
		.insert(schema.userMcpConnections)
		.values({
			catalogVisible: true,
			description: input.description,
			encryptedHeaders: input.encryptedHeaders,
			id: input.id,
			name: input.name,
			transport: input.transport,
			url: input.url,
			userId: input.userId,
		})
		.returning();
	if (!created) {
		throw new Error("MCP connection was not persisted.");
	}

	return created;
};

export const listCustomMcpConnections = async (db: ProductDb, userId: string) =>
	await db
		.select()
		.from(schema.userMcpConnections)
		.where(eq(schema.userMcpConnections.userId, userId));

export const updateCustomMcpConnection = async (
	db: ProductDb,
	input: Partial<Omit<CustomMcpConnectionInput, "id" | "userId">> & { id: string; userId: string },
) => {
	const [updated] = await db
		.update(schema.userMcpConnections)
		.set({
			description: input.description,
			encryptedHeaders: input.encryptedHeaders,
			name: input.name,
			transport: input.transport,
			updatedAt: new Date(),
			url: input.url,
		})
		.where(
			and(
				eq(schema.userMcpConnections.id, input.id),
				eq(schema.userMcpConnections.userId, input.userId),
			),
		)
		.returning();
	return updated ?? null;
};

export const deleteCustomMcpConnection = async (
	db: ProductDb,
	input: { id: string; userId: string },
) => {
	const deleted = await db
		.delete(schema.userMcpConnections)
		.where(
			and(
				eq(schema.userMcpConnections.id, input.id),
				eq(schema.userMcpConnections.userId, input.userId),
			),
		)
		.returning();
	return deleted.length > 0;
};
