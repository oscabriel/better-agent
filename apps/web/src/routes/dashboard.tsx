import { useQuery } from "@tanstack/react-query";
import { createFileRoute, getRouteApi, redirect } from "@tanstack/react-router";

import { getUser } from "@/functions/get-user";
import { orpc } from "@/utils/orpc";

const routeApi = getRouteApi("/dashboard");

const RouteComponent = () => {
	const { session } = routeApi.useRouteContext();

	const privateData = useQuery(orpc.privateData.queryOptions());

	return (
		<div>
			<h1>Dashboard</h1>
			<p>Welcome {session?.user.name}</p>
			<p>API: {privateData.data?.message}</p>
		</div>
	);
};

export const Route = createFileRoute("/dashboard")({
	beforeLoad: async () => {
		const session = await getUser();
		return { session };
	},
	component: RouteComponent,
	loader: ({ context }) => {
		if (!context.session) {
			throw redirect({
				to: "/login",
			});
		}
	},
});
