import { ORPCError } from "@orpc/server";
import { z } from "zod";

import { protectedProcedure, publicProcedure } from "../procedures";
import { MODEL_PROVIDER_IDS } from "./catalog";
import {
	encryptCredential,
	getCredentialMap,
	listProviderCredentials,
	redactCredential,
	upsertProviderCredential,
} from "./credentials";

const providerIdSchema = z.enum(MODEL_PROVIDER_IDS);
const saveCredentialInput = z.object({
	credential: z.string().trim().min(8),
	label: z.string().trim().max(80).optional(),
	providerId: providerIdSchema,
});

const encryptionSecret = (env: { API_ENCRYPTION_KEY?: string; BETTER_AUTH_SECRET: string }) =>
	env.API_ENCRYPTION_KEY ?? env.BETTER_AUTH_SECRET;

export const modelsRouter = {
	list: publicProcedure.handler(async ({ context }) => await context.modelCatalog.listModels()),
	listAvailable: protectedProcedure.handler(async ({ context }) => {
		const [models, credentials] = await Promise.all([
			context.modelCatalog.listModels(),
			getCredentialMap(context.db, context.session.user.id),
		]);
		return models.map((model) => ({
			...model,
			availableForAccount: Boolean(credentials[model.providerId]),
		}));
	}),
	listCredentials: protectedProcedure.handler(async ({ context }) => {
		const rows = await listProviderCredentials(context.db, context.session.user.id);
		return rows.map((row) => ({
			createdAt: row.createdAt,
			id: row.id,
			label: row.label,
			permissionBoundary:
				"Saved credential is a product-level Connected Account only; each Thinkspace still needs Permission.",
			providerId: row.providerId,
			redactedCredential: "••••",
			updatedAt: row.updatedAt,
		}));
	}),
	saveCredential: protectedProcedure
		.input(saveCredentialInput)
		.handler(async ({ context, input }) => {
			try {
				await upsertProviderCredential(context.db, {
					encryptedCredential: await encryptCredential(
						input.credential,
						encryptionSecret(context.env),
					),
					id: `provider_credential_${crypto.randomUUID()}`,
					label: input.label,
					providerId: input.providerId,
					userId: context.session.user.id,
				});
				return {
					permissionBoundary:
						"Saved credential is a product-level Connected Account only; each Thinkspace still needs Permission.",
					providerId: input.providerId,
					redactedCredential: redactCredential(input.credential),
				};
			} catch (error) {
				throw new ORPCError("INTERNAL_SERVER_ERROR", {
					message: error instanceof Error ? error.message : "Credential could not be saved.",
				});
			}
		}),
};
