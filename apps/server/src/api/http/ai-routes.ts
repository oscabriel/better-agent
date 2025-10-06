import { Hono } from "hono";
import { z } from "zod";
import { QuotaExceededError } from "@/server/domain/usage";
import { AICompletionService } from "@/server/services/ai/completion-service";
import {
	requireUserDO,
	UnauthorizedError,
} from "@/server/services/auth/session-guard";

const aiRequestSchema = z.object({
	messages: z.array(z.any()),
	conversationId: z.string(),
	modelId: z.string().optional(),
});

export const aiRoutes = new Hono();

aiRoutes.post("/", async (c) => {
	try {
		const { userId, stub } = await requireUserDO(c);
		const body = aiRequestSchema.parse(await c.req.json());

		const service = new AICompletionService(userId, stub);
		return await service.streamCompletion(body);
	} catch (err) {
		if (err instanceof QuotaExceededError) {
			const limitInfo =
				err.limitType === "daily"
					? "You've reached your daily message limit. Try again tomorrow or upgrade your plan."
					: "You've reached your monthly message limit. Your usage will reset on the 1st of next month.";
			return c.json(
				{
					error: limitInfo,
					limitType: err.limitType,
				},
				429,
			);
		}
		if (err instanceof UnauthorizedError) {
			return c.json({ error: "Authentication required" }, 401);
		}
		if (err instanceof Error && err.message.includes("Model access denied")) {
			return c.json({ error: err.message }, 403);
		}
		throw err;
	}
});
