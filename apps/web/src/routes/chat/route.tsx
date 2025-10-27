import { createFileRoute, redirect } from "@tanstack/react-router";
import { AppShellSkeleton } from "@/web/components/skeletons/app-skeleton";
import { requireAuthenticated } from "@/web/lib/route-guards";
import { ChatShell } from "./-components/chat-shell";

export const Route = createFileRoute("/chat")({
	beforeLoad: (opts) => {
		requireAuthenticated({
			auth: opts.context.auth,
			location: opts.location,
		});

		if (opts.location.pathname === "/chat/") {
			throw redirect({ to: "/chat", replace: true });
		}
	},
	component: ChatLayout,
	pendingComponent: AppShellSkeleton,
});

function ChatLayout() {
	return <ChatShell />;
}
