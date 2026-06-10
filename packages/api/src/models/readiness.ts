import type { LanguageModelV3 } from "@ai-sdk/provider";
import type { ProductDb } from "@better-agent/db";
import { userProductSettings } from "@better-agent/db/schema/settings";
import type { Thinkspace } from "@better-agent/db/schema/thinkspaces";
import type { CloudflareEnv } from "@better-agent/env/types";
import { eq } from "drizzle-orm";

import { DEFAULT_MODEL_ID, MODEL_PROVIDER_IDS } from "./catalog";
import type { ModelCatalogEntry, ModelProviderId } from "./catalog";
import { getDecryptedCredential } from "./credentials";
import type { ModelCatalog } from "./model-catalog";
import { createProductModelCatalog } from "./models-dev";
import { getThinkspace } from "../thinkspaces/repository";
import { ModelResolutionError, resolveLanguageModel } from "./resolver";
import type { ReasoningEffort, ThinkspaceModelPolicy } from "./resolver";

export type ModelReadinessStatus = "ready" | "not_ready";
export type ModelReadinessReason =
	| "unknown_model"
	| "missing_user_credential"
	| "permission_required"
	| "resolution_failed";

export interface ModelReadinessUserSettings {
	defaultModel: string | null;
	reasoningEffort: string;
}

export interface ModelReadinessReady {
	message: string;
	modelId: string;
	modelName: string;
	providerId: ModelProviderId;
	providerName: string;
	reasoningEffort: ReasoningEffort;
	status: "ready";
}

export interface ModelReadinessNotReady {
	message: string;
	modelId: string;
	modelName?: string;
	providerId?: ModelProviderId;
	providerName?: string;
	reason: ModelReadinessReason;
	reasoningEffort: ReasoningEffort;
	status: "not_ready";
}

export type ThinkspaceModelReadiness = ModelReadinessReady | ModelReadinessNotReady;

interface ThinkspaceModelEvaluation {
	model?: LanguageModelV3;
	readiness: ThinkspaceModelReadiness;
}

export interface ResolvedThinkspaceTurnModel {
	model: LanguageModelV3;
	readiness: ModelReadinessReady;
}

export class ThinkspaceTurnModelUnavailableError extends Error {
	readonly readiness: ModelReadinessNotReady;

	constructor(readiness: ModelReadinessNotReady) {
		super(readiness.message);
		this.name = "ThinkspaceTurnModelUnavailableError";
		this.readiness = readiness;
	}
}

export interface GetOwnedThinkspaceModelReadinessInput {
	db: ProductDb;
	env: ModelReadinessEnv;
	getThinkspaceByOwner?: GetThinkspaceByOwner;
	getUserSettings?: GetUserSettings;
	getUserCredential?: GetUserCredential;
	modelCatalog?: ModelCatalog;
	ownerUserId: string;
	thinkspaceId: string;
}

export interface CheckThinkspaceModelReadinessInput {
	db: ProductDb;
	env: ModelReadinessEnv;
	getUserCredential?: GetUserCredential;
	modelCatalog?: ModelCatalog;
	settings: ModelReadinessUserSettings | null;
	thinkspace: Pick<Thinkspace, "id" | "requestedPermissions">;
	userId: string;
}

type ModelReadinessEnv = Pick<
	CloudflareEnv,
	"API_ENCRYPTION_KEY" | "BETTER_AUTH_SECRET" | "MODEL_CATALOG_KV"
>;

const CATALOG_UNAVAILABLE_READINESS_MESSAGE =
	"The model catalog is temporarily unavailable, so the selected model could not be resolved. Try again shortly.";

type GetThinkspaceByOwner = (
	db: ProductDb,
	input: { ownerUserId: string; thinkspaceId: string },
) => Promise<Pick<Thinkspace, "id" | "requestedPermissions"> | null>;

type GetUserSettings = (
	db: ProductDb,
	userId: string,
) => Promise<ModelReadinessUserSettings | null>;

type GetUserCredential = (
	db: ProductDb,
	input: { providerId: ModelProviderId; secret: string; userId: string },
) => Promise<string | null>;

const REASONING_EFFORTS = ["low", "medium", "high"] as const satisfies ReasoningEffort[];

const isReasoningEffort = (value: string): value is ReasoningEffort =>
	REASONING_EFFORTS.includes(value as ReasoningEffort);

const encryptionSecret = (env: ModelReadinessEnv): string =>
	env.API_ENCRYPTION_KEY ?? env.BETTER_AUTH_SECRET;

const parsePermissions = (requestedPermissions: string): unknown[] => {
	try {
		const parsed = JSON.parse(requestedPermissions) as unknown;
		return Array.isArray(parsed) ? parsed : [];
	} catch {
		return [];
	}
};

const isProviderId = (value: unknown): value is ModelProviderId =>
	typeof value === "string" && MODEL_PROVIDER_IDS.includes(value as ModelProviderId);

const hasGrantedModelCredentialPermission = (
	thinkspace: Pick<Thinkspace, "requestedPermissions">,
	providerId: ModelProviderId,
): boolean =>
	parsePermissions(thinkspace.requestedPermissions).some((permission) => {
		if (!(permission && typeof permission === "object")) {
			return false;
		}

		const candidate = permission as {
			granted?: unknown;
			providerId?: unknown;
			status?: unknown;
			type?: unknown;
		};

		return (
			candidate.type === "model_provider_credential_permission" &&
			isProviderId(candidate.providerId) &&
			candidate.providerId === providerId &&
			(candidate.granted === true || candidate.status === "granted")
		);
	});

const getReasoningEffort = (settings: ModelReadinessUserSettings | null): ReasoningEffort => {
	const effort = settings?.reasoningEffort ?? "medium";
	return isReasoningEffort(effort) ? effort : "medium";
};

const getConfiguredModelId = (settings: ModelReadinessUserSettings | null): string =>
	settings?.defaultModel?.trim() || DEFAULT_MODEL_ID;

const notReady = ({
	message,
	modelDefinition,
	modelId,
	reason,
	reasoningEffort,
}: {
	message: string;
	modelDefinition?: ModelCatalogEntry | null;
	modelId: string;
	reason: ModelReadinessReason;
	reasoningEffort: ReasoningEffort;
}): ThinkspaceModelReadiness => ({
	message,
	modelId,
	modelName: modelDefinition?.name,
	providerId: modelDefinition?.providerId,
	providerName: modelDefinition?.providerName,
	reason,
	reasoningEffort,
	status: "not_ready",
});

const productSafeResolutionFailure = ({
	error,
	modelDefinition,
	modelId,
	reasoningEffort,
}: {
	error: ModelResolutionError;
	modelDefinition: ModelCatalogEntry;
	modelId: string;
	reasoningEffort: ReasoningEffort;
}): ThinkspaceModelReadiness => {
	if (error.message.includes("Permission")) {
		return notReady({
			message: "This Thinkspace needs Permission before using a saved provider credential.",
			modelDefinition,
			modelId,
			reason: "permission_required",
			reasoningEffort,
		});
	}

	if (error.message.startsWith("Missing ")) {
		return notReady({
			message: "The saved provider credential for this model is not available.",
			modelDefinition,
			modelId,
			reason: "missing_user_credential",
			reasoningEffort,
		});
	}

	return notReady({
		message: "The selected model configuration could not be resolved.",
		modelDefinition,
		modelId,
		reason: "resolution_failed",
		reasoningEffort,
	});
};

export const getUserProductModelSettings = async (
	db: ProductDb,
	userId: string,
): Promise<ModelReadinessUserSettings | null> => {
	const [settings] = await db
		.select({
			defaultModel: userProductSettings.defaultModel,
			reasoningEffort: userProductSettings.reasoningEffort,
		})
		.from(userProductSettings)
		.where(eq(userProductSettings.userId, userId))
		.limit(1);

	return settings ?? null;
};

const evaluateThinkspaceModel = async ({
	db,
	env,
	getUserCredential = getDecryptedCredential,
	modelCatalog,
	settings,
	thinkspace,
	userId,
}: CheckThinkspaceModelReadinessInput): Promise<ThinkspaceModelEvaluation> => {
	const modelId = getConfiguredModelId(settings);
	const reasoningEffort = getReasoningEffort(settings);
	const catalog = modelCatalog ?? createProductModelCatalog(env);

	let modelDefinition: ModelCatalogEntry | null;
	try {
		modelDefinition = await catalog.getModel(modelId);
	} catch {
		return {
			readiness: notReady({
				message: CATALOG_UNAVAILABLE_READINESS_MESSAGE,
				modelId,
				reason: "resolution_failed",
				reasoningEffort,
			}),
		};
	}

	if (!modelDefinition) {
		return {
			readiness: notReady({
				message: "The selected model is not in the supported model catalog.",
				modelId,
				reason: "unknown_model",
				reasoningEffort,
			}),
		};
	}

	const credentialPermission = hasGrantedModelCredentialPermission(
		thinkspace,
		modelDefinition.providerId,
	)
		? "granted"
		: "not_granted";
	const policy: ThinkspaceModelPolicy = { credentialPermission, modelId, reasoningEffort };
	const userCredential =
		credentialPermission === "granted"
			? await getUserCredential(db, {
					providerId: modelDefinition.providerId,
					secret: encryptionSecret(env),
					userId,
				})
			: null;

	try {
		const resolved = resolveLanguageModel({
			modelDefinition,
			policy,
			userCredentials: userCredential
				? { [modelDefinition.providerId]: userCredential }
				: undefined,
		});

		return {
			model: resolved.model,
			readiness: {
				message: "Model configuration is ready for a Thinkspace Agent turn.",
				modelId,
				modelName: modelDefinition.name,
				providerId: modelDefinition.providerId,
				providerName: modelDefinition.providerName,
				reasoningEffort,
				status: "ready",
			},
		};
	} catch (error) {
		if (error instanceof ModelResolutionError) {
			return {
				readiness: productSafeResolutionFailure({
					error,
					modelDefinition,
					modelId,
					reasoningEffort,
				}),
			};
		}

		return {
			readiness: notReady({
				message: "The selected model configuration could not be resolved.",
				modelDefinition,
				modelId,
				reason: "resolution_failed",
				reasoningEffort,
			}),
		};
	}
};

export const checkThinkspaceModelReadiness = async (
	input: CheckThinkspaceModelReadinessInput,
): Promise<ThinkspaceModelReadiness> => {
	const evaluation = await evaluateThinkspaceModel(input);
	return evaluation.readiness;
};

const evaluateOwnedThinkspaceModel = async ({
	db,
	env,
	getThinkspaceByOwner = getThinkspace,
	getUserCredential = getDecryptedCredential,
	getUserSettings = getUserProductModelSettings,
	modelCatalog,
	ownerUserId,
	thinkspaceId,
}: GetOwnedThinkspaceModelReadinessInput): Promise<ThinkspaceModelEvaluation | null> => {
	const thinkspace = await getThinkspaceByOwner(db, { ownerUserId, thinkspaceId });

	if (!thinkspace) {
		return null;
	}

	return await evaluateThinkspaceModel({
		db,
		env,
		getUserCredential: async (_db, input) => await getUserCredential(db, input),
		modelCatalog,
		settings: await getUserSettings(db, ownerUserId),
		thinkspace,
		userId: ownerUserId,
	});
};

export const getOwnedThinkspaceModelReadiness = async (
	input: GetOwnedThinkspaceModelReadinessInput,
): Promise<ThinkspaceModelReadiness | null> => {
	const evaluation = await evaluateOwnedThinkspaceModel(input);
	return evaluation?.readiness ?? null;
};

export const resolveOwnedThinkspaceTurnModel = async (
	input: GetOwnedThinkspaceModelReadinessInput,
): Promise<ResolvedThinkspaceTurnModel | null> => {
	const evaluation = await evaluateOwnedThinkspaceModel(input);

	if (!evaluation) {
		return null;
	}

	if (evaluation.readiness.status !== "ready" || !evaluation.model) {
		const readiness =
			evaluation.readiness.status === "ready"
				? {
						message: "The selected model configuration could not be resolved.",
						modelId: evaluation.readiness.modelId,
						reason: "resolution_failed" as const,
						reasoningEffort: evaluation.readiness.reasoningEffort,
						status: "not_ready" as const,
					}
				: evaluation.readiness;
		throw new ThinkspaceTurnModelUnavailableError(readiness);
	}

	return { model: evaluation.model, readiness: evaluation.readiness };
};
