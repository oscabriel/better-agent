import type { QueryClient } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { createRootRouteWithContext, Outlet } from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";
import { BackgroundLayout } from "@/web/components/background";
import Header from "@/web/components/navigation/header";
import { ThemeProvider } from "@/web/components/theme-provider";
import { Toaster } from "@/web/components/ui/sonner";
import type { AuthContextValue } from "@/web/lib/auth-context";
import type { orpc } from "@/web/lib/orpc";
import "@/web/index.css";

export interface RouterAppContext {
	orpc: typeof orpc;
	queryClient: QueryClient;
	auth: AuthContextValue;
}

export const Route = createRootRouteWithContext<RouterAppContext>()({
	component: RootComponent,
});

function RootComponent() {
	return (
		<>
			<ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme">
				<BackgroundLayout contentClassName="grid h-svh max-w-[100vw] grid-rows-[auto_1fr] overflow-x-hidden">
					<Header />
					<Outlet />
				</BackgroundLayout>
				<Toaster richColors />
			</ThemeProvider>
			<TanStackRouterDevtools position="bottom-left" />
			<ReactQueryDevtools position="bottom" buttonPosition="bottom-right" />
		</>
	);
}
