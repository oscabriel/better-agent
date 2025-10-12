import { z } from "zod";
import { getUserDOStub } from "@/server/db/do/get-user-stub";
import type { AppUIMessage } from "@/server/features/ai/types";
import { protectedProcedure } from "@/server/lib/orpc";

const listMessagesSchema = z.object({
	conversationId: z.string().min(1),
	limit: z.number().int().positive().max(200).optional(),
	cursor: z.number().int().optional(),
});

const upsertConversationSchema = z.object({
	conversationId: z.string().min(1),
	title: z.string().max(80).optional().nullable(),
});

export type ListMessagesResponse = {
	items: AppUIMessage[];
	nextCursor: number | null;
};

export const chatRouter = {
	listConversations: protectedProcedure.handler(async ({ context }) => {
		const stub = getUserDOStub(context.env, context.session.user.id);
		const conversations = await stub.listConversations();
		return { items: conversations };
	}),

	getConversation: protectedProcedure
		.input(z.object({ conversationId: z.string().min(1) }))
		.handler(async ({ context, input }) => {
			const stub = getUserDOStub(context.env, context.session.user.id);

			let conversation = await stub.getConversation(input.conversationId);
			if (!conversation) {
				await stub.upsertConversation(input.conversationId);
				conversation = await stub.getConversation(input.conversationId);
			}

			if (!conversation) {
				throw new Error("Conversation not found");
			}

			return conversation;
		}),

	listMessages: protectedProcedure
		.input(listMessagesSchema)
		.handler(async ({ context, input }): Promise<ListMessagesResponse> => {
			const stub = getUserDOStub(context.env, context.session.user.id);
			return await stub.listMessages(
				input.conversationId,
				input.limit,
				input.cursor,
			);
		}),

	upsertConversation: protectedProcedure
		.input(upsertConversationSchema)
		.handler(async ({ context, input }) => {
			const stub = getUserDOStub(context.env, context.session.user.id);
			const result = await stub.upsertConversation(
				input.conversationId,
				input.title ?? null,
			);
			return result;
		}),

	deleteConversation: protectedProcedure
		.input(z.object({ conversationId: z.string().min(1) }))
		.handler(async ({ context, input }) => {
			const stub = getUserDOStub(context.env, context.session.user.id);
			return await stub.deleteConversation(input.conversationId);
		}),
} as const;
