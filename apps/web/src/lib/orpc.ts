import { createORPCClient, onError } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { RouterClient } from "@orpc/server";
import { createTanstackQueryUtils } from "@orpc/tanstack-query";
import { QueryCache, QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { AppRouter } from "@/server/api/orpc";

export const queryClient = new QueryClient({
	queryCache: new QueryCache({
		onError: (error) => {
			toast.error(error.message, {
				action: {
					label: "retry",
					onClick: () => {
						queryClient.invalidateQueries();
					},
				},
			});
		},
	}),
});

const link = new RPCLink({
	url: `${import.meta.env.VITE_SERVER_URL}/api/orpc`,
	fetch(request, init) {
		return fetch(request, {
			...init,
			credentials: "include",
		});
	},
	interceptors: [
		onError((error) => {
			console.error(error);
		}),
	],
});

export type AppRouterClient = RouterClient<AppRouter>;

export const orpcClient: AppRouterClient =
	createORPCClient<AppRouterClient>(link);

export const orpc = createTanstackQueryUtils(orpcClient);
