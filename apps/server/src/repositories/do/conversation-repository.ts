import type {
	Conversation,
	MessageListResult,
} from "@/server/domain/conversations";
import type { AppUIMessage } from "@/server/domain/ui-messages";
import type { UserDurableObject } from "@/server/infra/do/user-durable-object";

export class ConversationRepository {
	constructor(private readonly stub: DurableObjectStub<UserDurableObject>) {}

	async listConversations(): Promise<Conversation[]> {
		return await this.stub.listConversations();
	}

	async getConversation(conversationId: string): Promise<Conversation | null> {
		return await this.stub.getConversation(conversationId);
	}

	async upsertConversation(
		conversationId: string,
		title?: string | null,
	): Promise<{ id: string; title: string | null }> {
		return await this.stub.upsertConversation(conversationId, title);
	}

	async deleteConversation(conversationId: string): Promise<{ id: string }> {
		return await this.stub.deleteConversation(conversationId);
	}

	async listMessages(
		conversationId: string,
		limit = 100,
		cursor?: number,
	): Promise<MessageListResult> {
		return await this.stub.listMessages(conversationId, limit, cursor);
	}

	async appendMessages(
		conversationId: string,
		items: AppUIMessage[],
	): Promise<{ count: number }> {
		return await this.stub.appendMessages(conversationId, items);
	}
}
