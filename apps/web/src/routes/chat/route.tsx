import { createFileRoute } from "@tanstack/react-router";
import { AppShellSkeleton } from "@/web/components/skeletons/app-skeleton";
import { requireAuthenticated } from "@/web/lib/route-guards";
import { ChatShell } from "./-components/chat-shell";

export const Route = createFileRoute("/chat")({
	beforeLoad: async (opts) => {
		await requireAuthenticated({
			authClient: opts.context.authClient,
			location: opts.location,
		});
	},
	component: ChatLayout,
	pendingComponent: AppShellSkeleton,
});

function ChatLayout() {
	return <ChatShell />;
}
