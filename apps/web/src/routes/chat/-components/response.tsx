import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/web/utils/cn";

interface ResponseProps extends HTMLAttributes<HTMLDivElement> {
	children: ReactNode;
}

/**
 * Response Component
 *
 * A lightweight wrapper for markdown content that provides:
 * 1. Base layout and responsiveness
 * 2. Overflow handling for tables and code
 * 3. Image responsiveness
 *
 * Delegates specific styling to:
 * - Prose classes (passed via className prop)
 * - CodeBlock component (for code elements)
 */
export function Response({ children, className, ...props }: ResponseProps) {
	return (
		<div
			className={cn(
				"markdown-response wrap-break-word w-full min-w-0",
				"space-y-4",
				"[&_pre]:max-w-full [&_pre]:overflow-x-auto",
				"[&_pre_code]:break-normal",
				"[&_table]:block [&_table]:w-full [&_table]:overflow-x-auto",
				"[&_img]:h-auto [&_img]:max-w-full",
				className,
			)}
			{...props}
		>
			{children}
		</div>
	);
}
