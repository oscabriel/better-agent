import type { ReasoningUIPart } from "ai";
import { Brain, ChevronDown, ChevronRight } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Badge } from "@/web/components/ui/badge";
import { Button } from "@/web/components/ui/button";
import { Card } from "@/web/components/ui/card";

interface ReasoningBlockProps {
	part: ReasoningUIPart;
}

export function ReasoningBlock({ part }: ReasoningBlockProps) {
	const [isExpanded, setIsExpanded] = useState(true); // Auto-expand during streaming
	const hasContent = Boolean(part.text?.trim());
	const isStreaming = part.state === "streaming";

	useEffect(() => {
		if (!isStreaming && hasContent) {
			setIsExpanded(false);
		}
	}, [isStreaming, hasContent]);

	const { badgeClass, badgeText } = useMemo(() => {
		if (isStreaming) {
			return {
				badgeClass:
					"bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300",
				badgeText: "Processing",
			};
		}
		return {
			badgeClass:
				"bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300",
			badgeText: "Complete",
		};
	}, [isStreaming]);

	return (
		<Card className="gap-2 border-l-4 border-l-purple-500 py-2">
			<div className="space-y-2 p-2">
				<div className="flex flex-wrap items-center justify-between gap-1.5">
					<div className="flex flex-wrap items-center gap-1.5">
						<Brain className="size-4 text-purple-600" />
						<span className="font-medium text-sm">Reasoning</span>
						<Badge className={badgeClass}>{badgeText}</Badge>
					</div>
					<Button
						variant="ghost"
						size="sm"
						className="h-7 px-2 text-xs"
						onClick={() => setIsExpanded((value) => !value)}
					>
						{isExpanded ? (
							<ChevronDown className="size-3" />
						) : (
							<ChevronRight className="size-3" />
						)}
						<span className="ml-1">{isExpanded ? "Hide" : "Show"} Details</span>
					</Button>
				</div>

				{isExpanded && (
					<div className="rounded bg-purple-50 p-3 dark:bg-purple-950">
						{hasContent ? (
							<div className="prose prose-sm dark:prose-invert prose-ol:my-2 prose-p:my-2 prose-ul:my-2 max-w-none prose-headings:font-bold prose-p:leading-relaxed">
								<ReactMarkdown remarkPlugins={[remarkGfm]}>
									{part.text}
								</ReactMarkdown>
							</div>
						) : (
							<div className="text-muted-foreground text-xs italic">
								{isStreaming
									? "Generating reasoning..."
									: "No reasoning content available"}
							</div>
						)}
					</div>
				)}
			</div>
		</Card>
	);
}
