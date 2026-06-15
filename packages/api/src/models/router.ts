import type { ProductDb } from "@better-agent/db";
import { userProductSettings } from "@better-agent/db/schema/settings";
import { ORPCError } from "@orpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { protectedProcedure, publicProcedure } from "../procedures";
import { DEFAULT_MODEL_ID, MODEL_PROVIDER_IDS } from "./catalog";
import { ModelCatalogError } from "./model-catalog";
import {
	encryptCredential,
	getCredentialMap,
	listProviderCredentials,
	redactCredential,
	upsertProviderCredential,
} from "./credentials";

const REASONING_EFFORTS = ["low", "medium", "high"] as const;

const providerIdSchema = z.enum(MODEL_PROVIDER_IDS);
const saveCredentialInput = z.object({
	credential: z.string().trim().min(8),
	label: z.string().trim().max(80).optional(),
	providerId: providerIdSchema,
});

const updateDefaultsInput = z.object({
	defaultModel: z.string().trim().min(1),
	reasoningEffort: z.enum(REASONING_EFFORTS),
});

const encryptionSecret = (env: { API_ENCRYPTION_KEY?: string; BETTER_AUTH_SECRET: string }) =>
	env.API_ENCRYPTION_KEY ?? env.BETTER_AUTH_SECRET;

const catalogUnavailableError = () =>
	new ORPCError("SERVICE_UNAVAILABLE", {
		message: "The model catalog is temporarily unavailable. Try again shortly.",
	});

/**
 * Encryption and storage failures are infrastructure details. The product
 * surface only learns the credential did not save, never the underlying
 * storage or crypto error, which could expose schema or runtime internals.
 */
const CREDENTIAL_SAVE_FAILED_MESSAGE = "Your credential could not be saved. Try again shortly.";

const isReasoningEffort = (
	value: string | null | undefined,
): value is (typeof REASONING_EFFORTS)[number] =>
	typeof value === "string" &&
	REASONING_EFFORTS.includes(value as (typeof REASONING_EFFORTS)[number]);

const getUserModelDefaults = async (db: ProductDb, userId: string) => {
	const [settings] = await db
		.select({
			defaultModel: userProductSettings.defaultModel,
			reasoningEffort: userProductSettings.reasoningEffort,
		})
		.from(userProductSettings)
		.where(eq(userProductSettings.userId, userId))
		.limit(1);

	return {
		defaultModel: settings?.defaultModel ?? DEFAULT_MODEL_ID,
		reasoningEffort: isReasoningEffort(settings?.reasoningEffort)
			? settings.reasoningEffort
			: "medium",
	};
};

export const modelsRouter = {
	getDefaults: protectedProcedure.handler(
		async ({ context }) => await getUserModelDefaults(context.db, context.session.user.id),
	),
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
			} catch {
				throw new ORPCError("INTERNAL_SERVER_ERROR", {
					message: CREDENTIAL_SAVE_FAILED_MESSAGE,
				});
			}
		}),
	updateDefaults: protectedProcedure
		.input(updateDefaultsInput)
		.handler(async ({ context, input }) => {
			let model = null;
			try {
				model = await context.modelCatalog.getModel(input.defaultModel);
			} catch (error) {
				if (error instanceof ModelCatalogError) {
					throw catalogUnavailableError();
				}
				throw error;
			}

			if (!model) {
				throw new ORPCError("BAD_REQUEST", {
					message: "Choose a model from the supported model catalog.",
				});
			}

			const updatedAt = new Date();
			await context.db
				.insert(userProductSettings)
				.values({
					defaultModel: model.id,
					reasoningEffort: input.reasoningEffort,
					updatedAt,
					userId: context.session.user.id,
				})
				.onConflictDoUpdate({
					set: {
						defaultModel: model.id,
						reasoningEffort: input.reasoningEffort,
						updatedAt,
					},
					target: userProductSettings.userId,
				});

			return {
				defaultModel: model.id,
				reasoningEffort: input.reasoningEffort,
			};
		}),
};
