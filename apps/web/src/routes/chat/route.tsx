import {
	createFileRoute,
	useNavigate,
	useRouterState,
} from "@tanstack/react-router";
import { useEffect } from "react";
import { AppShellSkeleton } from "@/web/components/app-skeleton";
import { requireAuthenticated } from "@/web/lib/route-guards";
import { ChatShell } from "@/web/routes/chat/-components/chat-shell";

export const Route = createFileRoute("/chat")({
	beforeLoad: (opts) => {
		requireAuthenticated({
			auth: opts.context.auth,
			location: opts.location,
		});
	},
	component: ChatLayout,
	pendingComponent: AppShellSkeleton,
});

function ChatLayout() {
	const navigate = useNavigate();
	const location = useRouterState({ select: (state) => state.location });

	useEffect(() => {
		const pathname = location.pathname ?? "";
		if (pathname === "/chat/" || pathname === "/chat") {
			void navigate({ to: "/chat", replace: true });
		}
	}, [location.pathname, navigate]);

	return <ChatShell />;
}
