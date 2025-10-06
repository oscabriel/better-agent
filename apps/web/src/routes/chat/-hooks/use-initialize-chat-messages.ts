import { useEffect, useRef } from "react";
import type { ChatMessage, RawChatMessage } from "@/web/types/chat";
import { normalizeMessages } from "@/web/utils/chat";

interface UseInitializeChatMessagesParams {
	chatId: string;
	items: RawChatMessage[] | undefined;
	isLoading: boolean;
	setMessages: (messages: ChatMessage[]) => void;
	scheduleScrollToBottom: (options?: {
		animation?: "instant" | "smooth";
		force?: boolean;
	}) => void;
}

export function useInitializeChatMessages({
	chatId,
	items,
	isLoading,
	setMessages,
	scheduleScrollToBottom,
}: UseInitializeChatMessagesParams) {
	const initializedChatId = useRef<string | null>(null);

	useEffect(() => {
		if (!items || isLoading) {
			return;
		}

		if (initializedChatId.current === chatId) {
			return;
		}

		setMessages(normalizeMessages(items));
		initializedChatId.current = chatId;
		scheduleScrollToBottom({ animation: "instant", force: true });
	}, [chatId, isLoading, items, scheduleScrollToBottom, setMessages]);
}
