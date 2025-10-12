import type { LanguageModel } from "ai";
import { generateText } from "ai";
import type { UserDurableObject } from "@/server/db/do/user-durable-object";
import { TITLE_GENERATION_CONFIG, TITLE_GENERATION_PROMPT } from "./constants";
import { extractMessageText } from "./messages";
import type { AppUIMessage } from "./types";

export async function maybeGenerateConversationTitle({
	userDOStub,
	model,
	conversationId,
	uiMessages,
	responseMessage,
}: {
	userDOStub: DurableObjectStub<UserDurableObject>;
	model: LanguageModel;
	conversationId: string;
	uiMessages: AppUIMessage[];
	responseMessage: AppUIMessage;
}) {
	const conversation = await userDOStub.getConversation(conversationId);
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
			await userDOStub.upsertConversation(conversationId, title);
		}
	} catch (error) {
		console.error("Failed to generate conversation title:", error);
	}
}
