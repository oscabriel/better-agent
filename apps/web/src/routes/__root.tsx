import type { QueryClient } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import {
	createRootRouteWithContext,
	Outlet,
	useRouterState,
} from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";
import { BackgroundLayout } from "@/web/components/background";
import { ErrorBoundary } from "@/web/components/error-boundary";
import Header from "@/web/components/navigation/header";
import { NotFound } from "@/web/components/not-found";
import { ThemeProvider } from "@/web/components/theme-provider";
import { Toaster } from "@/web/components/ui/sonner";
import type { AuthContextValue } from "@/web/lib/auth-context";
import type { orpc } from "@/web/lib/orpc";
import "@/web/index.css";
import { useEffect } from "react";

export interface RouterAppContext {
	orpc: typeof orpc;
	queryClient: QueryClient;
	auth: AuthContextValue;
}

export const Route = createRootRouteWithContext<RouterAppContext>()({
	component: RootComponent,
	notFoundComponent: NotFound,
	errorComponent: ErrorBoundary,
});

function RootComponent() {
	// force scroll to top on route change
	const router = useRouterState();

	useEffect(() => {
		window.scrollTo(0, 0);
	}, [router.location.pathname]);

	return (
		<>
			<ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme">
				<BackgroundLayout contentClassName="flex min-h-svh max-w-[100vw] flex-col overflow-x-hidden">
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
