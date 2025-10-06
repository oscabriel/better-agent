import { useEffect, useState } from "react";
import type { ChatMessage } from "@/web/types/chat";

interface UsePendingConversationMessageParams {
	chatId: string;
	messages: ChatMessage[];
	sendMessage: (message: { text: string }) => void;
	status: string;
	isMessagesReady: boolean;
	onError: (message: string) => void;
}

export function usePendingConversationMessage({
	chatId,
	messages,
	sendMessage,
	status,
	isMessagesReady,
	onError,
}: UsePendingConversationMessageParams) {
	const [pendingText, setPendingText] = useState<string | null>(null);

	useEffect(() => {
		if (typeof window === "undefined") {
			return;
		}

		const stored = window.sessionStorage.getItem(
			`better-chat:pending:${chatId}`,
		);

		if (!stored) {
			return;
		}

		setPendingText(stored);
		window.sessionStorage.removeItem(`better-chat:pending:${chatId}`);
	}, [chatId]);

	useEffect(() => {
		if (
			!pendingText ||
			status === "streaming" ||
			messages.length > 0 ||
			!isMessagesReady
		) {
			return;
		}

		try {
			sendMessage({ text: pendingText });
			setPendingText(null);
		} catch (error) {
			console.error("Failed to send pending message:", error);
			if (typeof window !== "undefined") {
				try {
					window.sessionStorage.setItem(
						`better-chat:pending:${chatId}`,
						pendingText,
					);
				} catch (_storageError) {
					// Ignore storage errors
				}
			}

			onError("Failed to send message");
			setPendingText(null);
		}
	}, [
		chatId,
		isMessagesReady,
		messages.length,
		onError,
		pendingText,
		sendMessage,
		status,
	]);
}
