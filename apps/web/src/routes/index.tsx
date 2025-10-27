import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Send } from "lucide-react";
import type { FormEvent } from "react";
import { useCallback, useState } from "react";
import { GuestShellSkeleton } from "@/web/components/guest-skeleton";
import { Button } from "@/web/components/ui/button";
import { Input } from "@/web/components/ui/input";
import { redirectIfAuthenticated } from "@/web/lib/route-guards";

export const Route = createFileRoute("/")({
	beforeLoad: (opts) => {
		redirectIfAuthenticated({ auth: opts.context.auth, to: "/chat" });
	},
	component: GuestLanding,
	pendingComponent: GuestShellSkeleton,
});

function GuestLanding() {
	const navigate = useNavigate();
	const [message, setMessage] = useState("");
	const isReady = message.trim().toLowerCase() === "get started";

	const handleSubmit = useCallback(
		(event: FormEvent<HTMLFormElement>) => {
			event.preventDefault();
			if (!isReady) {
				return;
			}
			setMessage("");
			void navigate({ to: "/auth/sign-in" });
		},
		[isReady, navigate],
	);

	return (
		<div className="relative flex min-h-screen flex-col justify-center px-4 py-8 sm:px-6">
			<div className="mx-auto w-full max-w-5xl space-y-8 sm:space-y-12">
				{/* Message Input Demo */}
				<form
					onSubmit={handleSubmit}
					className="mx-auto flex w-full items-center gap-2 sm:gap-3"
				>
					<Input
						value={message}
						onChange={(event) => setMessage(event.target.value)}
						placeholder="Type 'Get Started'"
						className="h-11 min-w-0 flex-1 rounded-md border border-border/70 bg-white/60 px-3 text-base tracking-wide placeholder:text-muted-foreground sm:h-12 sm:px-4 md:h-14 md:text-lg dark:bg-black/25"
					/>
					<Button
						type="submit"
						size="lg"
						disabled={!isReady}
						className="flex size-11 shrink-0 items-center justify-center rounded-md bg-orange-500 hover:bg-orange-600 disabled:bg-orange-500/60 disabled:opacity-70 sm:size-12 md:size-14"
					>
						<Send className="size-5 sm:size-6 md:size-7" />
					</Button>
				</form>

				{/* Tagline */}
				<div className="space-y-1 sm:space-y-2">
					<h1 className="font-bold text-3xl leading-tight sm:text-5xl md:text-6xl lg:text-7xl">
						<div className="flex justify-between">
							<span>Better</span>
							<span>Chat</span>
							<span className="text-orange-500 italic">through</span>
						</div>
						<div className="flex justify-between">
							<span>Durable</span>
							<span aria-hidden="true">
								<span className="inline sm:hidden">____</span>
								<span className="hidden sm:inline">_______</span>
							</span>
							<span>Objects</span>
						</div>
					</h1>
				</div>
			</div>
		</div>
	);
}
