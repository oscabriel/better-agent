import { z } from "zod";
import { protectedProcedure } from "@/server/lib/orpc";
import {
	BUILT_IN_MCP_SERVERS,
	MCPServerManager,
} from "@/server/services/mcp/mcp-server-manager";

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
		const manager = new MCPServerManager(context.session.user.id);
		return await manager.getAllServers();
	}),

	addCustomServer: protectedProcedure
		.input(addMCPServerSchema)
		.handler(async ({ context, input }) => {
			const manager = new MCPServerManager(context.session.user.id);
			const serverId = await manager.addCustomServer(input);
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
			const manager = new MCPServerManager(context.session.user.id);
			await manager.toggleServer(input.serverId, input.enabled);
			return { success: true };
		}),

	removeCustomServer: protectedProcedure
		.input(z.object({ serverId: z.string().min(1) }))
		.handler(async ({ context, input }) => {
			const builtInServer = BUILT_IN_MCP_SERVERS.find(
				(s) => s.id === input.serverId,
			);
			if (builtInServer) {
				throw new Error("Cannot delete built-in servers");
			}

			const manager = new MCPServerManager(context.session.user.id);
			await manager.removeCustomServer(input.serverId);
			return { success: true };
		}),
} as const;
