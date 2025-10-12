import type { UIMessage } from "ai";
import type { AppMessageMetadata } from "@/server/features/ai/types";
import type { ListMessagesResponse } from "@/server/features/chat/routes";
import type { RouterOutputs } from "@/server/lib/router";

/**
 * Shared chat-related types used across the application
 */

export type ApiErrorPayload = { error?: string; message?: string };

export type ConversationListResponse =
	RouterOutputs["chat"]["listConversations"];
export type ConversationSummary = ConversationListResponse["items"][number];

export type MessageListResponse = ListMessagesResponse;
export type RawChatMessage = MessageListResponse["items"][number];
export type ChatMessageMetadata = AppMessageMetadata;
export type ChatMessage = UIMessage<ChatMessageMetadata>;

export type QuickPrompt = {
	id: string;
	label: string;
	text: string;
};
