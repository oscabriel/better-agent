import { Toaster } from "@better-agent/ui/components/sonner";
import type { QueryClient } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { HeadContent, Outlet, Scripts, createRootRouteWithContext } from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";

import Header from "../components/header";
import appCss from "../index.css?url";

import type { orpc } from "@/utils/orpc";

export interface RouterAppContext {
	orpc: typeof orpc;
	queryClient: QueryClient;
}

const RootDocument = () => (
	<html lang="en" className="dark">
		<head>
			<HeadContent />
		</head>
		<body>
			<div className="grid h-svh grid-rows-[auto_1fr]">
				<Header />
				<main className="min-h-0 overflow-auto">
					<Outlet />
				</main>
			</div>
			<Toaster richColors />
			<TanStackRouterDevtools position="bottom-left" />
			<ReactQueryDevtools position="bottom" buttonPosition="bottom-right" />
			<Scripts />
		</body>
	</html>
);

export const Route = createRootRouteWithContext<RouterAppContext>()({
	component: RootDocument,
	head: () => ({
		links: [
			{
				href: appCss,
				rel: "stylesheet",
			},
		],
		meta: [
			{
				charSet: "utf-8",
			},
			{
				content: "width=device-width, initial-scale=1",
				name: "viewport",
			},
			{
				title: "Better Agent",
			},
			{
				content: "Create scoped Thinkspaces for durable agent work.",
				name: "description",
			},
		],
	}),
});
