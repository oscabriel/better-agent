import { useEffect, useState } from "react";
import type { Highlighter } from "shiki";
import { createHighlighter } from "shiki";
import { cn } from "@/web/utils/cn";

let highlighterInstance: Highlighter | null = null;
let highlighterPromise: Promise<Highlighter> | null = null;

const getHighlighter = async (): Promise<Highlighter> => {
	if (highlighterInstance) return highlighterInstance;
	if (!highlighterPromise) {
		highlighterPromise = createHighlighter({
			themes: ["github-dark", "github-light"],
			langs: [
				"javascript",
				"typescript",
				"jsx",
				"tsx",
				"python",
				"java",
				"c",
				"cpp",
				"csharp",
				"php",
				"ruby",
				"go",
				"rust",
				"swift",
				"kotlin",
				"scala",
				"html",
				"css",
				"scss",
				"sass",
				"json",
				"xml",
				"yaml",
				"markdown",
				"bash",
				"shell",
				"sql",
				"dockerfile",
				"nginx",
				"apache",
				"plaintext",
			],
		});
	}
	const highlighter = await highlighterPromise;
	highlighterInstance = highlighter;
	return highlighter;
};

interface UseCodeHighlighterOptions {
	codeString: string;
	language: string;
	expanded: boolean;
	wrapped: boolean;
	inline?: boolean;
	shouldHighlight?: boolean;
}

export const useCodeHighlighter = ({
	codeString,
	language,
	expanded,
	wrapped,
	inline = false,
	shouldHighlight = true,
}: UseCodeHighlighterOptions) => {
	const [highlightedCode, setHighlightedCode] = useState<string>("");
	const [isHighlighting, setIsHighlighting] = useState(true);

	useEffect(() => {
		let cancelled = false;

		const run = async () => {
			if (!shouldHighlight || inline || !codeString) {
				setHighlightedCode(codeString);
				setIsHighlighting(false);
				return;
			}

			setIsHighlighting(true);
			try {
				const highlighter = await getHighlighter();
				if (cancelled) return;

				const supported = new Set(highlighter.getLoadedLanguages() as string[]);
				const langToUse = supported.has(language) ? language : "plaintext";
				const prefersDark = Boolean(
					document?.documentElement.classList.contains("dark"),
				);

				const highlighted = highlighter.codeToHtml(codeString, {
					lang: langToUse,
					theme: prefersDark ? "github-dark" : "github-light",
					transformers: [
						{
							pre(node) {
								const element = node as {
									properties?: Record<string, unknown>;
								};
								if (!element.properties) {
									element.properties = {};
								}
								const props = element.properties;
								delete props.style;
								props.class = cn(
									"bg-[color:var(--code-surface)]/70",
									"max-h-full",
									"my-0",
									"overflow-x-auto",
									"px-4",
									"py-3",
									"relative",
									"shadow-none",
									"text-[1em]",
									"leading-[inherit]",
									"text-[color:var(--code-foreground)]",
									!expanded && "max-h-72",
								);
							},
							code(node) {
								const element = node as {
									properties?: Record<string, unknown>;
								};
								if (!element.properties) {
									element.properties = {};
								}
								const props = element.properties;
								props.class = cn(
									wrapped
										? "whitespace-pre-wrap break-words"
										: "whitespace-pre",
									"text-[1em]",
									"leading-[inherit]",
									"text-[color:var(--code-foreground)]",
								);
							},
						},
					],
				});
				setHighlightedCode(highlighted);
			} catch (error) {
				console.error("Error highlighting code", error);
				if (!cancelled) {
					setHighlightedCode(
						`<pre class="px-4 py-3 whitespace-pre text-[1em] leading-[inherit] text-[color:var(--code-foreground)]"><code class="text-[1em] leading-[inherit]">${codeString}</code></pre>`,
					);
				}
			} finally {
				if (!cancelled) {
					setIsHighlighting(false);
				}
			}
		};

		run();

		return () => {
			cancelled = true;
		};
	}, [codeString, language, expanded, wrapped, inline, shouldHighlight]);

	return { highlightedCode, isHighlighting };
};
