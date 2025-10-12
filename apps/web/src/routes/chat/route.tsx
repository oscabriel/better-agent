import {
	createFileRoute,
	Navigate,
	useNavigate,
	useRouterState,
} from "@tanstack/react-router";
import { useEffect } from "react";
import { AppShellSkeleton } from "@/web/components/app-skeleton";
import { useAuth } from "@/web/lib/auth-context";
import { requireAuthenticated } from "@/web/lib/route-guards";
import { ChatShell } from "@/web/routes/chat/-components/chat-shell";

export const Route = createFileRoute("/chat")({
	beforeLoad: async (opts) => {
		await requireAuthenticated({
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
	const auth = useAuth();

	useEffect(() => {
		const pathname = location.pathname ?? "";
		if (pathname === "/chat/" || pathname === "/chat") {
			void navigate({ to: "/chat", replace: true });
		}
	}, [location.pathname, navigate]);

	// Runtime session guard - handles session expiry/sign-out during use
	if (!auth.session?.user) {
		return (
			<Navigate
				to="/"
				replace
				search={{ redirect: location.href ?? location.pathname ?? "/chat" }}
			/>
		);
	}

	return <ChatShell />;
}
