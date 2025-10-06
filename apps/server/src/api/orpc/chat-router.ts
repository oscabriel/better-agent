import { z } from "zod";
import { getUserDOStub } from "@/server/infra/do/user-do-helper";
import { protectedProcedure } from "@/server/lib/orpc";
import { ConversationRepository } from "@/server/repositories/do/conversation-repository";

const listMessagesSchema = z.object({
	conversationId: z.string().min(1),
	limit: z.number().int().positive().max(200).optional(),
	cursor: z.number().int().optional(),
});

const upsertConversationSchema = z.object({
	conversationId: z.string().min(1),
	title: z.string().max(80).optional().nullable(),
});

export const chatRouter = {
	listConversations: protectedProcedure.handler(async ({ context }) => {
		const stub = getUserDOStub(context.env, context.session.user.id);
		const repo = new ConversationRepository(stub);
		const conversations = await repo.listConversations();
		return { items: conversations };
	}),

	getConversation: protectedProcedure
		.input(z.object({ conversationId: z.string().min(1) }))
		.handler(async ({ context, input }) => {
			const stub = getUserDOStub(context.env, context.session.user.id);
			const repo = new ConversationRepository(stub);

			let conversation = await repo.getConversation(input.conversationId);
			if (!conversation) {
				await repo.upsertConversation(input.conversationId);
				conversation = await repo.getConversation(input.conversationId);
			}

			if (!conversation) {
				throw new Error("Conversation not found");
			}

			return conversation;
		}),

	listMessages: protectedProcedure
		.input(listMessagesSchema)
		.handler(async ({ context, input }) => {
			const stub = getUserDOStub(context.env, context.session.user.id);
			const repo = new ConversationRepository(stub);
			const result = await repo.listMessages(
				input.conversationId,
				input.limit,
				input.cursor,
			);
			return result;
		}),

	upsertConversation: protectedProcedure
		.input(upsertConversationSchema)
		.handler(async ({ context, input }) => {
			const stub = getUserDOStub(context.env, context.session.user.id);
			const repo = new ConversationRepository(stub);
			const result = await repo.upsertConversation(
				input.conversationId,
				input.title ?? null,
			);
			return result;
		}),

	deleteConversation: protectedProcedure
		.input(z.object({ conversationId: z.string().min(1) }))
		.handler(async ({ context, input }) => {
			const stub = getUserDOStub(context.env, context.session.user.id);
			const repo = new ConversationRepository(stub);
			return await repo.deleteConversation(input.conversationId);
		}),
} as const;
