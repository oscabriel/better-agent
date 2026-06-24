import type { ProductDb } from "@better-agent/db";
import * as schema from "@better-agent/db/schema/index";
import { and, eq } from "drizzle-orm";

import type { McpAuthType, McpRiskLevel, McpTransport } from "./catalog";

export interface CustomMcpConnectionInput {
	authType: McpAuthType;
	description?: string;
	encryptedHeaders: string;
	id: string;
	name: string;
	riskLevel: McpRiskLevel;
	transport: McpTransport;
	url: string;
	userId: string;
}

export const createCustomMcpConnection = async (db: ProductDb, input: CustomMcpConnectionInput) => {
	const [created] = await db
		.insert(schema.userMcpConnections)
		.values({
			authType: input.authType,
			catalogVisible: true,
			description: input.description,
			encryptedHeaders: input.encryptedHeaders,
			id: input.id,
			name: input.name,
			riskLevel: input.riskLevel,
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
			authType: input.authType,
			description: input.description,
			encryptedHeaders: input.encryptedHeaders,
			name: input.name,
			riskLevel: input.riskLevel,
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
