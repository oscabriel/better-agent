import type { ToolUIPart } from "ai";
import { nanoid } from "nanoid";
import type {
	ApiErrorPayload,
	ChatMessage,
	ChatMessageMetadata,
	RawChatMessage,
} from "../types/chat";

/**
 * Chat-related utility functions
 */

export function generateConversationId(): string {
	return nanoid();
}

export async function parseJsonResponse<T>(response: Response): Promise<T> {
	let parsed: unknown = null;
	try {
		parsed = await response.json();
	} catch (_error) {
		parsed = null;
	}

	if (!response.ok) {
		let message = response.statusText || "Request failed";
		if (parsed && typeof parsed === "object") {
			const { error, message: bodyMessage } = parsed as ApiErrorPayload;
			if (typeof error === "string" && error.trim().length > 0) {
				message = error;
			} else if (
				typeof bodyMessage === "string" &&
				bodyMessage.trim().length > 0
			) {
				message = bodyMessage;
			}
		}
		throw new Error(message);
	}

	return parsed as T;
}

export function normalizeMetadata(
	metadata: RawChatMessage["metadata"],
): ChatMessageMetadata | undefined {
	if (metadata && typeof metadata === "object" && !Array.isArray(metadata)) {
		return metadata as ChatMessageMetadata;
	}
	return undefined;
}

export function normalizeMessagePart(
	part: RawChatMessage["parts"][number],
): ChatMessage["parts"][number] {
	if (part.type === "dynamic-tool") {
		return {
			...part,
			input: "input" in part ? part.input : undefined,
		} as ChatMessage["parts"][number];
	}

	if (typeof part.type === "string" && part.type.startsWith("tool-")) {
		const toolPart = part as ToolUIPart;
		return {
			...toolPart,
			input: "input" in toolPart ? toolPart.input : undefined,
		} as ChatMessage["parts"][number];
	}

	return part as ChatMessage["parts"][number];
}

export function normalizeMessages(messages: RawChatMessage[]): ChatMessage[] {
	return messages.map((message) => {
		const metadata = normalizeMetadata(message.metadata);
		const parts = message.parts.map(
			normalizeMessagePart,
		) as ChatMessage["parts"];
		return {
			...message,
			metadata,
			parts,
		} as ChatMessage;
	});
}
