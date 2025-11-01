import { ChevronDown } from "lucide-react";
import { Button } from "@/web/components/ui/button";
import { Card } from "@/web/components/ui/card";
import type { ChatMessage } from "@/web/types/chat";
import { MessageRenderer } from "./message-renderer";

interface ChatMessagesListProps {
	messages: ChatMessage[];
	error: Error | null | undefined;
	shouldShowStreamingIndicator: boolean;
	isAtBottom: boolean;
	scrollRef: React.Ref<HTMLDivElement>;
	contentRef: React.Ref<HTMLDivElement>;
	onScrollToBottom: () => void;
}

export function ChatMessagesList({
	messages,
	error,
	shouldShowStreamingIndicator,
	isAtBottom,
	scrollRef,
	contentRef,
	onScrollToBottom,
}: ChatMessagesListProps) {
	return (
		<div
			className="relative flex-1 overflow-y-auto px-3 py-4 sm:px-6"
			ref={scrollRef}
		>
			<div ref={contentRef} className="w-full space-y-4 pb-10">
				{messages.map((message) => (
					<MessageRenderer key={message.id} message={message} />
				))}
				{shouldShowStreamingIndicator && (
					<div className="flex justify-start">
						<Card
							className="max-w-[80%] gap-2 py-2"
							role="status"
							aria-live="polite"
						>
							<div className="px-3 py-2">
								<span className="block animate-pulse text-muted-foreground text-xl leading-none">
									...
								</span>
								<span className="sr-only">
									Assistant is preparing a response
								</span>
							</div>
						</Card>
					</div>
				)}
				{error && (
					<div className="flex justify-center">
						<Card className="gap-2 border-destructive bg-destructive/10 py-2">
							<div className="px-3 py-2">
								<p className="text-destructive text-sm">
									{error.message || "An error occurred"}
								</p>
							</div>
						</Card>
					</div>
				)}
			</div>
			{!isAtBottom && (
				<div className="pointer-events-none sticky bottom-4 flex justify-center pr-2">
					<Button
						variant="secondary"
						size="icon"
						className="pointer-events-auto shadow"
						onClick={onScrollToBottom}
						aria-label="Scroll to latest message"
					>
						<ChevronDown className="size-4" />
					</Button>
				</div>
			)}
		</div>
	);
}
