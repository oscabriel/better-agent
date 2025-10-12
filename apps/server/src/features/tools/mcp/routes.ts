import { z } from "zod";
import { protectedProcedure } from "@/server/lib/orpc";
import { BUILT_IN_MCP_SERVERS } from "./catalog";
import { addCustomMcpServer, removeCustomMcpServer } from "./mutations";
import { getAllMCPServers, toggleMCPServer } from "./utils";

const addMCPServerSchema = z.object({
	name: z.string().min(1).max(100),
	url: z.url(),
	type: z.enum(["http", "sse"]),
	description: z.string().optional(),
	headers: z.record(z.string(), z.string()).optional(),
});

const toggleServerSchema = z.object({
	serverId: z.string().min(1),
	enabled: z.boolean(),
});

export const mcpRouter = {
	listServers: protectedProcedure.handler(async ({ context }) => {
		return await getAllMCPServers(context.session.user.id);
	}),

	addCustomServer: protectedProcedure
		.input(addMCPServerSchema)
		.handler(async ({ context, input }) => {
			const userId = context.session.user.id;
			const serverId = `custom_${Date.now()}`;

			await addCustomMcpServer(userId, {
				id: serverId,
				name: input.name,
				url: input.url,
				type: input.type,
				description: input.description,
				headers: input.headers,
				enabled: true,
			});

			return {
				id: serverId,
				...input,
				isBuiltIn: false,
				enabled: true,
			};
		}),

	toggleServer: protectedProcedure
		.input(toggleServerSchema)
		.handler(async ({ context, input }) => {
			await toggleMCPServer(
				context.session.user.id,
				input.serverId,
				input.enabled,
			);
			return { success: true };
		}),

	removeCustomServer: protectedProcedure
		.input(z.object({ serverId: z.string().min(1) }))
		.handler(async ({ context, input }) => {
			const userId = context.session.user.id;

			const builtInServer = BUILT_IN_MCP_SERVERS.find(
				(s) => s.id === input.serverId,
			);
			if (builtInServer) {
				throw new Error("Cannot delete built-in servers");
			}

			await removeCustomMcpServer(userId, input.serverId);
			return { success: true };
		}),
} as const;
