import {
	createFileRoute,
	Navigate,
	useNavigate,
	useRouterState,
} from "@tanstack/react-router";
import { useEffect } from "react";
import { AppShellSkeleton } from "@/web/components/app-skeleton";
import { authClient } from "@/web/lib/auth-client";
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
	const { data: session, isPending } = authClient.useSession();

	useEffect(() => {
		const pathname = location.pathname ?? "";
		if (pathname === "/chat/" || pathname === "/chat") {
			void navigate({ to: "/chat", replace: true });
		}
	}, [location.pathname, navigate]);

	if (isPending) {
		return <AppShellSkeleton />;
	}

	if (!session?.user) {
		return (
			<Navigate
				to="/auth/sign-in"
				replace
				search={{ redirect: location.href ?? location.pathname ?? "/chat" }}
			/>
		);
	}

	return <ChatShell />;
}
