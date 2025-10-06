import type { UIMessage } from "ai";
import { z } from "zod";

export const appMessageMetadataSchema = z
	.object({
		createdAt: z.number().int().nonnegative().optional(),
		modelId: z.string().optional(),
	})
	.catchall(z.unknown());

export type AppMessageMetadata = z.infer<typeof appMessageMetadataSchema>;

export type AppUIMessage = UIMessage<AppMessageMetadata>;
