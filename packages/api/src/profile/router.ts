import { schema } from "@better-agent/db";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { protectedProcedure } from "../procedures";

const updateProfileInput = z.object({
	name: z.string().trim().min(1, "Display name is required.").max(80),
});

export const profileRouter = {
	get: protectedProcedure.handler(({ context }) => ({
		email: context.session.user.email,
		id: context.session.user.id,
		image: context.session.user.image,
		name: context.session.user.name,
	})),
	update: protectedProcedure.input(updateProfileInput).handler(async ({ context, input }) => {
		const updatedAt = new Date();
		await context.db
			.update(schema.user)
			.set({
				name: input.name,
				updatedAt,
			})
			.where(eq(schema.user.id, context.session.user.id));

		return {
			email: context.session.user.email,
			id: context.session.user.id,
			image: context.session.user.image,
			name: input.name,
			updatedAt,
		};
	}),
};
