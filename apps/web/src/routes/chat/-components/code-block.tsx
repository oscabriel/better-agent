import {
	AlignLeft,
	CheckIcon,
	ChevronDown,
	ChevronUp,
	CopyIcon,
	WrapText,
} from "lucide-react";
import { memo, useMemo, useState } from "react";
import { Button } from "@/web/components/ui/button";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/web/components/ui/tooltip";
import { useCodeHighlighter } from "@/web/hooks/use-code-highlighter";
import { copyToClipboard } from "@/web/utils/clipboard";
import { cn } from "@/web/utils/cn";

/**
 * CodeBlock Component
 *
 * Handles all code-related styling and functionality for both:
 * 1. Multi-line code blocks (with syntax highlighting, copy button, expand/collapse)
 * 2. Inline code snippets (simple styled spans)
 *
 * This is the single source of truth for code appearance in the app.
 * The assistant prose class delegates code styling to this component.
 */
export const CodeBlock = memo(
	({
		inline,
		className,
		children,
		disable,
		default: defaultProps,
		...props
	}: {
		inline?: boolean;
		className?: string;
		children?: React.ReactNode;
		disable?: {
			copy?: boolean;
			expand?: boolean;
			wrap?: boolean;
		};
		default?: {
			expand?: boolean;
			wrap?: boolean;
		};
	}) => {
		const match = /language-(\w+)/.exec(className || "");
		const language = match ? match[1] : "plaintext";

		const [isMultiLine, lineNumber] = useMemo(() => {
			const lines =
				[...(Array.isArray(children) ? children : [children])]
					.filter((x): x is string => typeof x === "string")
					.join("")
					.match(/\n/g)?.length ?? 0;
			return [lines > 1, lines];
		}, [children]);

		const [didRecentlyCopied, setDidRecentlyCopied] = useState(false);
		const [expanded, setExpanded] = useState(defaultProps?.expand ?? false);
		const [wrapped, setWrapped] = useState(defaultProps?.wrap ?? false);

		const codeString = useMemo(() => {
			return [...(Array.isArray(children) ? children : [children])]
				.filter((x): x is string => typeof x === "string")
				.join("");
		}, [children]);

		const { highlightedCode } = useCodeHighlighter({
			codeString,
			language,
			expanded,
			wrapped,
			inline,
			shouldHighlight: !inline && (!!match || isMultiLine),
		});

		if (!children) return null;

		return !inline && (match || isMultiLine) ? (
			<div className="code-block-container relative my-2 flex flex-col overflow-hidden border border-border">
				<div className="code-block-header flex items-center gap-2 rounded-t-md border-border border-b bg-muted px-2 py-1">
					<span className="pl-2 font-mono text-muted-foreground text-xs">
						{language}
					</span>
					{lineNumber >= 16 && (
						<span className="pt-0.5 pl-2 font-mono text-muted-foreground/50 text-xs">
							{lineNumber + 1} lines
						</span>
					)}
					<div className="flex-grow" />
					{lineNumber >= 16 && !disable?.expand && (
						<Tooltip>
							<TooltipTrigger asChild>
								<Button
									variant="ghost"
									size="icon"
									className="size-[1.5rem] text-muted-foreground"
									onClick={() => setExpanded((t) => !t)}
								>
									{expanded ? (
										<ChevronUp className="!size-4" />
									) : (
										<ChevronDown className="!size-4" />
									)}
								</Button>
							</TooltipTrigger>
							<TooltipContent>
								{expanded ? "Collapse" : "Expand"}
							</TooltipContent>
						</Tooltip>
					)}
					{!disable?.wrap && (
						<Tooltip>
							<TooltipTrigger asChild>
								<Button
									variant="ghost"
									size="icon"
									className="size-[1.5rem] text-muted-foreground"
									onClick={() => setWrapped((t) => !t)}
								>
									{wrapped ? (
										<WrapText className="!size-4" />
									) : (
										<AlignLeft className="!size-4" />
									)}
								</Button>
							</TooltipTrigger>
							<TooltipContent>
								{wrapped ? "Unwrap lines" : "Wrap lines"}
							</TooltipContent>
						</Tooltip>
					)}
					{!disable?.copy && (
						<Tooltip>
							<TooltipTrigger asChild>
								<Button
									variant="ghost"
									size="icon"
									className="size-[1.5rem] text-muted-foreground"
									onClick={() => {
										copyToClipboard(codeString);
										setDidRecentlyCopied(true);
										setTimeout(() => {
											setDidRecentlyCopied(false);
										}, 1000);
									}}
								>
									{didRecentlyCopied ? (
										<CheckIcon className="size-4" />
									) : (
										<CopyIcon className="size-4" />
									)}
								</Button>
							</TooltipTrigger>
							<TooltipContent>
								{didRecentlyCopied ? "Copied!" : "Copy code"}
							</TooltipContent>
						</Tooltip>
					)}
				</div>

				<div
					// biome-ignore lint/security/noDangerouslySetInnerHtml: shiki is safe
					dangerouslySetInnerHTML={{ __html: highlightedCode }}
					className="code-block-content pl-2 font-mono text-sm leading-normal"
				/>

				{!expanded && lineNumber > 17 && (
					<div className="absolute right-0 bottom-0 left-0 h-16 rounded-b-md bg-gradient-to-t from-sidebar via-sidebar/80 to-transparent" />
				)}
			</div>
		) : (
			<code
				className={cn(
					className,
					"not-prose",
					"font-medium font-mono text-sm leading-normal",
					"border border-primary/40 bg-primary/20",
					"p-0.15 sm:p-0.5",
					"text-foreground",
				)}
				{...props}
			>
				{children}
			</code>
		);
	},
);
