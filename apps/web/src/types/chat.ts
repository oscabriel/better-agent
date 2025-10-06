import type { UIMessage } from "ai";
import type { RouterOutputs } from "@/server/api/orpc";
import type { AppMessageMetadata } from "@/server/domain/ui-messages";

/**
 * Shared chat-related types used across the application
 */

export type ApiErrorPayload = { error?: string; message?: string };

export type ConversationListResponse =
	RouterOutputs["chat"]["listConversations"];
export type ConversationSummary = ConversationListResponse["items"][number];

export type MessageListResponse = RouterOutputs["chat"]["listMessages"];
export type RawChatMessage = MessageListResponse["items"][number];
export type ChatMessageMetadata = AppMessageMetadata;
export type ChatMessage = UIMessage<ChatMessageMetadata>;

export type QuickPrompt = {
	id: string;
	label: string;
	text: string;
};
