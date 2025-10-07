import type { FileUIPart, ReasoningUIPart, TextUIPart } from "ai";
import { isToolOrDynamicToolUIPart } from "ai";
import { Copy } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/web/components/ui/button";
import { Card } from "@/web/components/ui/card";
import type { ChatMessage } from "@/web/types/chat";
import { cn } from "@/web/utils/cn";
import { MemoizedResponse } from "./memoized-response";
import { ReasoningBlock } from "./reasoning-block";
import { ToolCallBlock } from "./tool-call-block";

type MessagePart = ChatMessage["parts"][number];

export interface MessageRendererProps {
	message: ChatMessage;
	proseClass?: string;
}

const defaultProseClass = cn(
	"prose prose-base dark:prose-invert max-w-none",
	"text-sm md:text-base",
	"break-words [overflow-wrap:anywhere]",
	"prose-headings:font-semibold prose-headings:text-foreground",
	"prose-h1:mb-2 prose-h2:mb-1.5 prose-h3:mb-1.5 prose-h1:text-lg prose-h2:text-base prose-h3:text-sm md:prose-h1:mb-3 md:prose-h2:mb-2 md:prose-h3:mb-2 md:prose-h1:text-xl md:prose-h2:text-lg md:prose-h3:text-base",
	"prose-p:my-2 prose-strong:text-foreground prose-p:leading-relaxed md:prose-p:my-3",
	"prose-a:text-primary prose-a:no-underline hover:prose-a:underline",
	"prose-code:px-0.5 prose-code:py-0 md:prose-code:px-1 md:prose-code:py-0.5",
	"prose-ol:my-3 prose-ul:my-3 prose-li:mt-1.5 prose-li:mb-0.5 prose-li:marker:text-primary md:prose-ol:my-4 md:prose-ul:my-4 md:prose-li:mt-2 md:prose-li:mb-1",
	"[&_ol>li>p]:my-0.5 md:[&_ol>li>p]:my-1 [&_ul>li>p]:my-0.5 md:[&_ul>li>p]:my-1",
	"prose-blockquote:my-3 prose-blockquote:border-l-border prose-blockquote:bg-muted/50 prose-blockquote:pl-3 prose-blockquote:italic md:prose-blockquote:my-4 md:prose-blockquote:pl-4",
	"prose-pre:my-2 prose-pre:bg-transparent prose-pre:p-0 md:prose-pre:my-3",
	"prose-hr:my-4 prose-table:my-3 md:prose-hr:my-6 md:prose-table:my-4",
);

export function MessageRenderer({
	message,
	proseClass = defaultProseClass,
}: MessageRendererProps) {
	if (message.role === "user") {
		return (
			<div className="flex justify-end">
				<Card className="max-w-[80%] gap-1.5 bg-primary py-1.5 text-primary-foreground md:gap-2 md:py-2">
					<div className="space-y-1.5 px-2 py-1.5 md:space-y-2 md:px-3 md:py-2">
						{message.parts.map((part: MessagePart, index: number) => (
							<div key={index.toString()}>
								<UserPartRenderer part={part} />
							</div>
						))}
					</div>
				</Card>
			</div>
		);
	}

	return (
		<div className="w-full">
			<div className="space-y-1.5 md:space-y-2">
				{message.parts.map((part: MessagePart, index: number) => (
					<ResponsePartRenderer
						key={index.toString()}
						part={part}
						messageId={message.id}
						proseClass={proseClass}
					/>
				))}
			</div>
			<MessageMetadata message={message} />
		</div>
	);
}

function UserPartRenderer({ part }: { part: MessagePart }) {
	if (isTextPart(part)) {
		return (
			<p className="whitespace-pre-wrap text-sm md:text-base">{part.text}</p>
		);
	}

	if (isFilePart(part) && part.mediaType.startsWith("image/") && part.url) {
		return (
			<img src={part.url} alt="User upload" className="max-w-full rounded" />
		);
	}

	return null;
}

function ResponsePartRenderer({
	part,
	messageId,
	proseClass,
}: {
	part: MessagePart;
	messageId: string;
	proseClass: string;
}) {
	if (part.type === "step-start") {
		return null;
	}

	if (isTextPart(part)) {
		return (
			<MemoizedResponse
				content={part.text}
				id={messageId}
				proseClass={proseClass}
			/>
		);
	}

	if (isReasoningPart(part)) {
		return <ReasoningBlock part={part} />;
	}

	if (isToolOrDynamicToolUIPart(part)) {
		return <ToolCallBlock part={part} />;
	}

	return null;
}

function isTextPart(part: MessagePart): part is TextUIPart {
	return part.type === "text" && typeof part.text === "string";
}

function isFilePart(part: MessagePart): part is FileUIPart {
	return part.type === "file";
}

function isReasoningPart(part: MessagePart): part is ReasoningUIPart {
	return part.type === "reasoning";
}

function MessageMetadata({ message }: { message: ChatMessage }) {
	const [copied, setCopied] = useState(false);
	const modelId = message.metadata?.modelId;

	if (!modelId || typeof modelId !== "string") return null;

	const modelDisplayName = getModelDisplayName(modelId);

	const handleCopy = async () => {
		const textParts = message.parts
			.filter((part): part is TextUIPart => part.type === "text")
			.map((part) => part.text)
			.join("\n\n");

		if (!textParts) {
			toast.error("No text content to copy");
			return;
		}

		try {
			await navigator.clipboard.writeText(textParts);
			setCopied(true);
			toast.success("Response copied to clipboard");
			setTimeout(() => setCopied(false), 2000);
		} catch {
			toast.error("Failed to copy to clipboard");
		}
	};

	return (
		<div className="mt-1.5 flex items-center gap-2 text-muted-foreground text-xs md:mt-2 md:gap-3 md:text-sm">
			<span>{modelDisplayName}</span>
			<span>•</span>
			<Button
				variant="ghost"
				size="sm"
				className="-mx-2 md:-mx-3 hover:bg-transparent hover:text-foreground"
				onClick={handleCopy}
			>
				<Copy className="size-3 md:size-4" />
				{copied ? "Copied" : "Copy"}
			</Button>
		</div>
	);
}

function getModelDisplayName(modelId: string): string {
	const [_provider, model] = modelId.split(":");
	if (!model) return modelId;

	return model
		.replace(/-/g, " ")
		.replace(/\//g, " ")
		.split(" ")
		.map((word) => {
			if (word.toLowerCase() === "gpt") return "GPT";
			return word.charAt(0).toUpperCase() + word.slice(1);
		})
		.join(" ");
}
