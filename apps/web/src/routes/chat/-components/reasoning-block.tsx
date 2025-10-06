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
		<Card className="gap-1.5 border-l-4 border-l-purple-500 py-1.5 md:gap-2 md:py-2">
			<div className="space-y-1.5 p-1.5 md:space-y-2 md:p-2">
				<div className="flex flex-wrap items-center justify-between gap-1 md:gap-1.5">
					<div className="flex flex-wrap items-center gap-1 md:gap-1.5">
						<Brain className="size-4 text-purple-600" />
						<span className="font-medium text-xs md:text-sm">Reasoning</span>
						<Badge className={`hidden md:inline-flex ${badgeClass}`}>
							{badgeText}
						</Badge>
					</div>
					<Button
						variant="ghost"
						size="sm"
						className="h-6 px-1.5 text-xs md:h-7 md:px-2"
						onClick={() => setIsExpanded((value) => !value)}
					>
						{isExpanded ? (
							<ChevronDown className="size-3" />
						) : (
							<ChevronRight className="size-3" />
						)}
						<span className="ml-0.5 md:ml-1">
							{isExpanded ? "Hide" : "Show"} Details
						</span>
					</Button>
				</div>

				{isExpanded && (
					<div className="rounded bg-purple-50 p-2 md:p-3 dark:bg-purple-950">
						{hasContent ? (
							<div className="prose prose-sm dark:prose-invert prose-ol:my-1.5 prose-p:my-1.5 prose-ul:my-1.5 max-w-none prose-headings:font-bold prose-p:leading-relaxed md:prose-ol:my-2 md:prose-p:my-2 md:prose-ul:my-2">
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
