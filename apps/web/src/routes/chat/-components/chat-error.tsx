import { useRouter } from "@tanstack/react-router";
import { MessageSquareOff } from "lucide-react";
import { Button } from "@/web/components/ui/button";

export function ChatError() {
	const router = useRouter();

	return (
		<div className="flex h-full w-full items-center justify-center p-8">
			<div className="flex flex-col items-center gap-6 text-center">
				{/* Error Icon */}
				<div className="flex justify-center">
					<MessageSquareOff className="size-12" />
				</div>

				{/* Error Message */}
				<div className="space-y-3">
					<h2 className="font-semibold text-4xl">Chat not found</h2>
					<p className="text-base text-muted-foreground">
						It may have been deleted or you don't have access to it.
					</p>
				</div>

				{/* Action Button */}
				<Button
					onClick={() => router.navigate({ to: "/chat" })}
					variant="default"
					size="lg"
					className="text-base"
				>
					Start a New Chat
				</Button>
			</div>
		</div>
	);
}
