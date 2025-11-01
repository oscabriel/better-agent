import { useCallback } from "react";
import { useStickToBottom } from "use-stick-to-bottom";

/**
 * Hook to manage chat scroll behavior with auto-scroll to bottom
 */
export function useChatScroll() {
	const { scrollRef, contentRef, isAtBottom, scrollToBottom } =
		useStickToBottom({
			initial: "instant",
			resize: "instant",
		});

	const scheduleScrollToBottom = useCallback(
		({
			animation = "instant",
			force = false,
		}: {
			animation?: "instant" | "smooth";
			force?: boolean;
		} = {}) => {
			if (!force && !isAtBottom) {
				return;
			}

			const performScroll = () => {
				void scrollToBottom({ animation });
			};

			if (typeof window === "undefined") {
				performScroll();
				return;
			}

			window.requestAnimationFrame(() => {
				window.requestAnimationFrame(performScroll);
			});
		},
		[isAtBottom, scrollToBottom],
	);

	return {
		scrollRef,
		contentRef,
		isAtBottom,
		scheduleScrollToBottom,
	};
}
