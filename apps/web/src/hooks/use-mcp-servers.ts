import { useQuery } from "@tanstack/react-query";
import type { RouterOutputs } from "@/server/api/orpc";
import { orpc } from "@/web/lib/orpc";

export type McpServer = RouterOutputs["mcp"]["listServers"][number];

export function useMcpServers(options?: { enabled?: boolean }) {
	return useQuery(
		orpc.mcp.listServers.queryOptions({
			staleTime: 30_000,
			...options,
		}),
	);
}
