import type { Schema } from "hast-util-sanitize";
import { defaultSchema } from "hast-util-sanitize";
import { memo, type ReactNode } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import rehypeSanitize from "rehype-sanitize";
import remarkGfm from "remark-gfm";
import { CodeBlock } from "./code-block";
import { Response } from "./response";

const sanitizeSchema: Schema = {
	...defaultSchema,
	tagNames: defaultSchema.tagNames,
	attributes: {
		...defaultSchema.attributes,
		"*": [...(defaultSchema.attributes?.["*"] ?? []), "className"],
		a: [...(defaultSchema.attributes?.a ?? []), "target", "rel"],
		code: [...(defaultSchema.attributes?.code ?? []), "className"],
		pre: [...(defaultSchema.attributes?.pre ?? []), "className"],
	},
};

type MarkdownCodeProps = {
	inline?: boolean;
	className?: string;
	children?: ReactNode;
};

const renderCode = ({ className, inline, children }: MarkdownCodeProps) => (
	<CodeBlock className={className} inline={inline}>
		{children}
	</CodeBlock>
);

const components = {
	code: renderCode,
} satisfies Partial<Components>;

/**
 * MemoizedResponse Component
 *
 * The main component for rendering assistant messages with markdown.
 *
 * Responsibilities:
 * 1. Parse markdown content with react-markdown
 * 2. Apply prose styling (via proseClass prop)
 * 3. Route code elements to CodeBlock component
 * 4. Sanitize HTML for security
 * 5. Memoization for performance
 *
 * Style Flow:
 * proseClass → Response wrapper → ReactMarkdown → CodeBlock (for code)
 */
export const MemoizedResponse = memo(
	({
		content,
		id,
		proseClass = "prose prose-base max-w-none break-words [overflow-wrap:anywhere]",
	}: {
		content: string;
		id: string;
		proseClass?: string;
	}) => (
		<Response data-track-id={id} className={proseClass}>
			<ReactMarkdown
				remarkPlugins={[remarkGfm]}
				rehypePlugins={[[rehypeSanitize, sanitizeSchema]]}
				components={components}
			>
				{content}
			</ReactMarkdown>
		</Response>
	),
);

MemoizedResponse.displayName = "MemoizedResponse";
