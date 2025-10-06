import type { LanguageModel } from "ai";
import { generateText } from "ai";
import type { AppUIMessage } from "@/server/domain/ui-messages";
import type { ConversationRepository } from "@/server/repositories/do/conversation-repository";
import { extractMessageText } from "./message-service";
import {
	TITLE_GENERATION_CONFIG,
	TITLE_GENERATION_PROMPT,
} from "./prompt-service";

export async function maybeGenerateConversationTitle({
	repo,
	model,
	conversationId,
	uiMessages,
	responseMessage,
}: {
	repo: ConversationRepository;
	model: LanguageModel;
	conversationId: string;
	uiMessages: AppUIMessage[];
	responseMessage: AppUIMessage;
}) {
	const conversation = await repo.getConversation(conversationId);
	if (!conversation || conversation.title) {
		return;
	}

	if (uiMessages.length < 1) {
		return;
	}

	const userText = extractMessageText(uiMessages[0]);
	const assistantText = extractMessageText(responseMessage);

	if (!userText.trim() || !assistantText.trim()) {
		return;
	}

	try {
		const { text } = await generateText({
			model,
			system: TITLE_GENERATION_PROMPT,
			prompt: `User: ${userText}\n\nAssistant: ${assistantText}`,
		});

		const title = text
			.trim()
			.replace(/^["']|["']$/g, "")
			.slice(0, TITLE_GENERATION_CONFIG.maxLength);

		if (title.length > 0) {
			await repo.upsertConversation(conversationId, title);
		}
	} catch (error) {
		console.error("Failed to generate conversation title:", error);
	}
}
