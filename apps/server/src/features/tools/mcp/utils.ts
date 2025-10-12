import { updateUserSettings } from "@/server/features/settings/mutations";
import { getUserSettings } from "@/server/features/settings/queries";
import { BUILT_IN_MCP_SERVERS } from "./catalog";
import { toggleCustomMcpServer } from "./mutations";
import { getCustomMcpServers } from "./queries";
import type { MCPServerConfig, UserMCPServer } from "./types";

export async function getAllMCPServers(
	userId: string,
): Promise<Array<MCPServerConfig | (UserMCPServer & { isBuiltIn: false })>> {
	const customServers = await getCustomMcpServers(userId);
	const settings = await getUserSettings(userId);
	const enabledBuiltInIds = settings.enabledMcpServers || [];

	return [
		...BUILT_IN_MCP_SERVERS.map((server) => ({
			...server,
			enabled: enabledBuiltInIds.includes(server.id),
		})),
		...customServers.map((server) => ({
			...server,
			isBuiltIn: false as const,
		})),
	];
}

export async function toggleMCPServer(
	userId: string,
	serverId: string,
	enabled: boolean,
): Promise<void> {
	if (serverId.startsWith("custom_")) {
		await toggleCustomMcpServer(userId, serverId, enabled);
	} else {
		const settings = await getUserSettings(userId);
		let enabledServers = settings.enabledMcpServers || [];

		if (enabled) {
			if (!enabledServers.includes(serverId)) {
				enabledServers = [...enabledServers, serverId];
			}
		} else {
			enabledServers = enabledServers.filter((id) => id !== serverId);
		}

		await updateUserSettings(userId, {
			enabledMcpServers: enabledServers,
		});
	}
}
