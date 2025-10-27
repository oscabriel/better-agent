import { createFileRoute, redirect } from "@tanstack/react-router";
import { AppShellSkeleton } from "@/web/components/app-skeleton";
import { requireAuthenticated } from "@/web/lib/route-guards";
import { ChatShell } from "@/web/routes/chat/-components/chat-shell";

export const Route = createFileRoute("/chat")({
	beforeLoad: (opts) => {
		requireAuthenticated({
			auth: opts.context.auth,
			location: opts.location,
		});

		// Normalize /chat/ (trailing slash) to /chat
		const pathname = opts.location.pathname ?? "";
		if (pathname === "/chat/") {
			throw redirect({ to: "/chat", replace: true });
		}
	},
	component: ChatLayout,
	pendingComponent: AppShellSkeleton,
});

function ChatLayout() {
	return <ChatShell />;
}
