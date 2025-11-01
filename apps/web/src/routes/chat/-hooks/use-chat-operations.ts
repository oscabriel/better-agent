import { useChat } from "@ai-sdk/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { DefaultChatTransport } from "ai";
import { MAX_MESSAGE_BATCH } from "@/web/lib/constants";
import { orpc } from "@/web/lib/orpc";
import type { ChatMessage, ConversationSummary } from "@/web/types/chat";
import { useInitializeChatMessages } from "./use-initialize-chat-messages";
import { usePendingConversationMessage } from "./use-pending-conversation-message";
import { useStreamingIndicator } from "./use-streaming-indicator";

interface UseChatOperationsParams {
	chatId: string;
	selectedModelIdRef: React.RefObject<string | undefined>;
	scheduleScrollToBottom: (options?: {
		animation?: "instant" | "smooth";
		force?: boolean;
	}) => void;
	onError?: (message: string) => void;
}

/**
 * Hook to manage all chat operations including queries, mutations, and chat state
 */
export function useChatOperations({
	chatId,
	selectedModelIdRef,
	scheduleScrollToBottom,
	onError,
}: UseChatOperationsParams) {
	const apiBase = `${import.meta.env.VITE_SERVER_URL}/api`;
	const queryClient = useQueryClient();

	const messagesQuery = useQuery(
		orpc.chat.listMessages.queryOptions({
			input: { conversationId: chatId },
			staleTime: 30_000,
			placeholderData: (previousData) => previousData,
		}),
	);

	const conversationQuery = useQuery(
		orpc.chat.getConversation.queryOptions({
			input: { conversationId: chatId },
			staleTime: 30_000,
		}),
	);

	const { messages, status, error, sendMessage, setMessages } =
		useChat<ChatMessage>({
			id: chatId,
			transport: new DefaultChatTransport({
				api: `${apiBase}/ai`,
				credentials: "include",
				body: () => ({
					conversationId: chatId,
					messages: messages.slice(-MAX_MESSAGE_BATCH),
					modelId: selectedModelIdRef.current,
				}),
			}),
			onFinish: async () => {
				queryClient.invalidateQueries({
					queryKey: orpc.chat.listMessages.key({
						input: { conversationId: chatId },
					}),
				});
				queryClient.invalidateQueries({
					queryKey: orpc.chat.getConversation.key({
						input: { conversationId: chatId },
					}),
				});
				if (messages.length <= 2) {
					queryClient.invalidateQueries({
						queryKey: orpc.chat.listConversations.key(),
					});
				}
				queryClient.invalidateQueries({
					queryKey: orpc.usage.getCurrentSummary.key(),
				});
				queryClient.invalidateQueries({
					queryKey: orpc.usage.getStats.key(),
				});
			},
		});

	const isMessagesReady =
		!messagesQuery.isLoading &&
		!messagesQuery.isFetching &&
		messagesQuery.isSuccess;

	useInitializeChatMessages({
		chatId,
		items: messagesQuery.data?.items,
		isLoading: messagesQuery.isLoading,
		setMessages,
		scheduleScrollToBottom,
	});

	usePendingConversationMessage({
		chatId,
		messages,
		sendMessage,
		status,
		isMessagesReady,
		onError: onError || (() => {}),
	});

	const title =
		(conversationQuery.data as ConversationSummary)?.title?.trim() ||
		"New chat";

	const shouldShowStreamingIndicator = useStreamingIndicator({
		messages,
		status,
	});

	return {
		messages,
		status,
		error,
		sendMessage,
		messagesQuery,
		conversationQuery,
		title,
		shouldShowStreamingIndicator,
	};
}
