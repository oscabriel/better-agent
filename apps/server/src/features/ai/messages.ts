import type {
	DynamicToolUIPart,
	ReasoningUIPart,
	TextUIPart,
	ToolUIPart,
	UIMessage,
} from "ai";
import { isToolOrDynamicToolUIPart, safeValidateUIMessages } from "ai";
import { nanoid } from "nanoid";
import { MAX_MESSAGE_LENGTH, MAX_PROMPT_MESSAGES } from "./constants";
import type { AppUIMessage } from "./types";
import { appMessageMetadataSchema } from "./types";

export async function validateIncomingMessages(
	rawMessages: unknown[],
): Promise<AppUIMessage[]> {
	const validation = await safeValidateUIMessages({
		messages: rawMessages,
		metadataSchema: appMessageMetadataSchema.optional(),
	});

	if (!validation.success) {
		throw new Error(`Invalid UI messages: ${validation.error.message}`);
	}

	return validation.data.map((message) => normalizeMessage(message));
}

export function normalizeMessage(message: UIMessage): AppUIMessage {
	const normalizedId =
		typeof message.id === "string" && message.id.trim().length > 0
			? message.id.trim()
			: `${message.role}-${nanoid()}`;

	const parts = message.parts.map((part) =>
		part.type === "text"
			? ({
					...part,
					text: part.text.slice(0, MAX_MESSAGE_LENGTH),
				} satisfies TextUIPart)
			: part,
	);

	const metadata = normalizeMetadata(message.metadata);

	return {
		...message,
		id: normalizedId,
		parts,
		metadata,
	};
}

export function mergeHistoryWithIncoming(
	stored: AppUIMessage[],
	incoming: AppUIMessage[],
): AppUIMessage[] {
	const merged: AppUIMessage[] = [];
	const seenIds = new Set<string>();
	const seenHashes = new Set<string>();

	for (const message of stored) {
		if (seenIds.has(message.id)) continue;
		seenIds.add(message.id);
		const contentKey = createContentKey(message);
		if (contentKey) {
			seenHashes.add(contentKey);
		}
		merged.push(message);
	}

	for (const message of incoming) {
		if (seenIds.has(message.id)) {
			continue;
		}
		const contentKey = createContentKey(message);
		if (contentKey && seenHashes.has(contentKey)) {
			continue;
		}
		seenIds.add(message.id);
		if (contentKey) {
			seenHashes.add(contentKey);
		}
		merged.push(message);
	}

	return merged.slice(-MAX_PROMPT_MESSAGES);
}

export function extractMessageText(
	message: AppUIMessage | null | undefined,
): string {
	if (!message) {
		return "";
	}
	return message.parts
		.filter((part): part is TextUIPart => part.type === "text" && !!part.text)
		.map((part) => part.text.trim())
		.filter((value) => value.length > 0)
		.join("\n");
}

export function extractStructuredAnnotations(message: AppUIMessage) {
	const reasoning = message.parts.filter(
		(part): part is ReasoningUIPart => part.type === "reasoning",
	);
	const toolParts = message.parts.filter(
		(part): part is ToolUIPart | DynamicToolUIPart =>
			isToolOrDynamicToolUIPart(part),
	);
	const toolCalls = toolParts.filter(
		(part) =>
			part.state === "input-streaming" || part.state === "input-available",
	);
	const toolResults = toolParts.filter(
		(part) => part.state === "output-available",
	);
	const toolErrors = toolParts.filter((part) => part.state === "output-error");

	return {
		reasoning,
		toolCalls,
		toolResults,
		errors: toolErrors,
	};
}

function createContentKey(message: AppUIMessage): string | null {
	const textParts = message.parts
		.filter((part): part is TextUIPart => part.type === "text" && !!part.text)
		.map((part) => part.text.trim())
		.filter((text) => text.length > 0);

	if (textParts.length === 0) {
		return null;
	}

	return `${message.role}:${textParts.join("\n")}`;
}

function normalizeMetadata(metadata: unknown) {
	const base =
		metadata && typeof metadata === "object"
			? { ...(metadata as Record<string, unknown>) }
			: {};

	const createdAtCandidate = base.createdAt;
	const createdAt =
		typeof createdAtCandidate === "number" &&
		Number.isFinite(createdAtCandidate)
			? createdAtCandidate
			: Date.now();

	return {
		...base,
		createdAt,
	};
}
