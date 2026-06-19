import { ORPCError } from "@orpc/server";
import { z } from "zod";

import { encryptCredential } from "../crypto";
import { protectedProcedure, publicProcedure } from "../procedures";
import { listBuiltInMcpServers } from "./catalog";
import {
	createCustomMcpConnection,
	deleteCustomMcpConnection,
	listCustomMcpConnections,
	updateCustomMcpConnection,
} from "./repository";
import { assertSafeMcpServerUrl, McpUrlPolicyError } from "./url-policy";

const transportSchema = z.enum(["streamable_http", "sse"]);
const headersSchema = z.record(z.string().min(1), z.string().min(1)).optional();
const connectionInput = z.object({
	description: z.string().trim().max(400).optional(),
	headers: headersSchema,
	name: z.string().trim().min(1).max(100),
	transport: transportSchema.default("streamable_http"),
	url: z.string().trim().min(1),
});
const updateInput = connectionInput.partial().extend({ connectionId: z.string().min(1) });
const deleteInput = z.object({ connectionId: z.string().min(1) });

const encryptionSecret = (env: { API_ENCRYPTION_KEY?: string; BETTER_AUTH_SECRET: string }) =>
	env.API_ENCRYPTION_KEY ?? env.BETTER_AUTH_SECRET;
const redactHeaderNames = (headers: Record<string, string> | undefined) =>
	Object.keys(headers ?? {}).map((name) => ({ name, value: "••••" }));
const toConnectionOutput = (row: Awaited<ReturnType<typeof listCustomMcpConnections>>[number]) => ({
	createdAt: row.createdAt,
	description: row.description,
	enabledByDefaultForThinkspaces: false,
	id: row.id,
	isBuiltIn: false,
	name: row.name,
	redactedHeaders:
		row.encryptedHeaders === "{}" ? [] : [{ name: "stored secret headers", value: "••••" }],
	transport: row.transport,
	updatedAt: row.updatedAt,
	url: row.url,
});

const toBadRequest = (error: Error) => new ORPCError("BAD_REQUEST", { message: error.message });

export const mcpRouter = {
	createConnection: protectedProcedure
		.input(connectionInput)
		.handler(async ({ context, input }) => {
			try {
				const url = assertSafeMcpServerUrl(input.url);
				const encryptedHeaders = input.headers
					? await encryptCredential(JSON.stringify(input.headers), encryptionSecret(context.env))
					: "{}";
				const created = await createCustomMcpConnection(context.db, {
					description: input.description,
					encryptedHeaders,
					id: `mcp_connection_${crypto.randomUUID()}`,
					name: input.name,
					transport: input.transport,
					url: url.toString(),
					userId: context.session.user.id,
				});
				return {
					...toConnectionOutput(created),
					redactedHeaders: redactHeaderNames(input.headers),
				};
			} catch (error) {
				if (error instanceof McpUrlPolicyError) {
					throw toBadRequest(error);
				}
				throw error;
			}
		}),
	deleteConnection: protectedProcedure.input(deleteInput).handler(async ({ context, input }) => {
		const deleted = await deleteCustomMcpConnection(context.db, {
			id: input.connectionId,
			userId: context.session.user.id,
		});
		if (!deleted) {
			throw new ORPCError("NOT_FOUND", { message: "MCP connection was not found." });
		}
		return { success: true };
	}),
	listCatalog: publicProcedure.handler(() => listBuiltInMcpServers()),
	listConnections: protectedProcedure.handler(async ({ context }) => {
		const rows = await listCustomMcpConnections(context.db, context.session.user.id);
		return rows.map(toConnectionOutput);
	}),
	updateConnection: protectedProcedure.input(updateInput).handler(async ({ context, input }) => {
		try {
			const encryptedHeaders = input.headers
				? await encryptCredential(JSON.stringify(input.headers), encryptionSecret(context.env))
				: undefined;
			const updated = await updateCustomMcpConnection(context.db, {
				description: input.description,
				encryptedHeaders,
				id: input.connectionId,
				name: input.name,
				transport: input.transport,
				url: input.url ? assertSafeMcpServerUrl(input.url).toString() : undefined,
				userId: context.session.user.id,
			});
			if (!updated) {
				throw new ORPCError("NOT_FOUND", { message: "MCP connection was not found." });
			}
			return { ...toConnectionOutput(updated), redactedHeaders: redactHeaderNames(input.headers) };
		} catch (error) {
			if (error instanceof McpUrlPolicyError) {
				throw toBadRequest(error);
			}
			throw error;
		}
	}),
};
