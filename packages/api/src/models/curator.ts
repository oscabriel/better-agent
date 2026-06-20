import type { LanguageModelV3, SharedV3ProviderOptions } from "@ai-sdk/provider";
import type { ProductDb } from "@better-agent/db";
import { userProductSettings } from "@better-agent/db/schema/settings";
import type { CloudflareEnv } from "@better-agent/env/types";
import { eq } from "drizzle-orm";

import { DEFAULT_MODEL_ID } from "./catalog";
import type { ModelCatalogEntry, ModelProviderId } from "./catalog";
import { getDecryptedCredential } from "./credentials";
import type { ModelCatalog } from "./model-catalog";
import { createProductModelCatalog } from "./models-dev";
import { buildResolvedLanguageModel } from "./resolver";
import type { ReasoningEffort } from "./resolver";

/**
 * Why a Curator-specific resolution path at all: the Thinkspace-Agent resolver
 * (`resolveLanguageModel`) gates the user's saved credential behind a per-
 * Thinkspace `credentialPermission === "granted"` check, because a Thinkspace
 * Agent reaching the user's key crosses a Thinkspace boundary. The Curator is a
 * different role — it is the user employing their own key to set up their own
 * Thinkspace, before any Thinkspace Agent exists — so it resolves the same
 * product credential WITHOUT that Permission gate (ADR-0010). This module owns
 * that ungated path; it must never be reused for a Thinkspace Agent turn.
 */

export type CuratorModelReadinessReason =
	| "unknown_model"
	| "missing_user_credential"
	| "resolution_failed";

/** Which user setting decided the effective Curator model. */
export type CuratorModelSource = "curator_model" | "default_model" | "system_default";

export interface CuratorModelSettings {
	curatorModel: string | null;
	defaultModel: string | null;
	reasoningEffort: string;
}

export interface CuratorModelReadinessReady {
	modelId: string;
	modelName: string;
	providerId: ModelProviderId;
	providerName: string;
	reasoningEffort: ReasoningEffort;
	source: CuratorModelSource;
	status: "ready";
}

export interface CuratorModelReadinessNotReady {
	message: string;
	modelId: string;
	modelName?: string;
	providerId?: ModelProviderId;
	providerName?: string;
	reason: CuratorModelReadinessReason;
	source: CuratorModelSource;
	status: "not_ready";
}

export type CuratorModelReadiness = CuratorModelReadinessReady | CuratorModelReadinessNotReady;

export interface ResolvedCuratorModel {
	model: LanguageModelV3;
	modelDefinition: ModelCatalogEntry;
	providerId: ModelProviderId;
	providerModelId: string;
	readiness: CuratorModelReadinessReady;
	reasoningEffort: ReasoningEffort;
	reasoningProviderOptions?: SharedV3ProviderOptions;
}

type CuratorModelEnv = Pick<
	CloudflareEnv,
	"API_ENCRYPTION_KEY" | "BETTER_AUTH_SECRET" | "MODEL_CATALOG_KV"
>;

type GetUserCredential = (
	db: ProductDb,
	input: { providerId: ModelProviderId; secret: string; userId: string },
) => Promise<string | null>;

export interface CuratorModelInput {
	db: ProductDb;
	env: CuratorModelEnv;
	getUserCredential?: GetUserCredential;
	modelCatalog?: ModelCatalog;
	settings: CuratorModelSettings | null;
	userId: string;
}

const CATALOG_UNAVAILABLE_MESSAGE =
	"The model catalog is temporarily unavailable, so the Curator model could not be resolved. Try again shortly.";
const CONNECT_FIRST_MESSAGE =
	"Connect a model provider credential before starting a curation conversation with the Curator.";
const UNKNOWN_MODEL_MESSAGE = "The selected Curator model is not in the supported model catalog.";

const REASONING_EFFORTS = ["low", "medium", "high"] as const satisfies ReasoningEffort[];

const isReasoningEffort = (value: string | null | undefined): value is ReasoningEffort =>
	typeof value === "string" && REASONING_EFFORTS.includes(value as ReasoningEffort);

const encryptionSecret = (env: CuratorModelEnv): string =>
	env.API_ENCRYPTION_KEY ?? env.BETTER_AUTH_SECRET;

/**
 * Resolve the effective Curator model id and its provenance:
 * `curatorModel ?? defaultModel ?? DEFAULT_MODEL_ID`. The Curator model setting
 * governs only what the Curator reasons with during setup, never the model it
 * configures for the Thinkspace Agent (that stays the draft's `set_model`).
 */
const resolveCuratorModelId = (
	settings: CuratorModelSettings | null,
): { modelId: string; source: CuratorModelSource } => {
	const curatorModel = settings?.curatorModel?.trim();
	if (curatorModel) {
		return { modelId: curatorModel, source: "curator_model" };
	}
	const defaultModel = settings?.defaultModel?.trim();
	if (defaultModel) {
		return { modelId: defaultModel, source: "default_model" };
	}
	return { modelId: DEFAULT_MODEL_ID, source: "system_default" };
};

const curatorReasoningEffort = (settings: CuratorModelSettings | null): ReasoningEffort =>
	isReasoningEffort(settings?.reasoningEffort) ? settings.reasoningEffort : "medium";

interface CuratorModelEvaluation {
	resolved?: ResolvedCuratorModel;
	readiness: CuratorModelReadiness;
}

const evaluateCuratorModel = async ({
	db,
	env,
	getUserCredential = getDecryptedCredential,
	modelCatalog,
	settings,
	userId,
}: CuratorModelInput): Promise<CuratorModelEvaluation> => {
	const { modelId, source } = resolveCuratorModelId(settings);
	const reasoningEffort = curatorReasoningEffort(settings);
	const catalog = modelCatalog ?? createProductModelCatalog(env);

	let modelDefinition: ModelCatalogEntry | null;
	try {
		modelDefinition = await catalog.getModel(modelId);
	} catch {
		return {
			readiness: {
				message: CATALOG_UNAVAILABLE_MESSAGE,
				modelId,
				reason: "resolution_failed",
				source,
				status: "not_ready",
			},
		};
	}

	if (!modelDefinition) {
		return {
			readiness: {
				message: UNKNOWN_MODEL_MESSAGE,
				modelId,
				reason: "unknown_model",
				source,
				status: "not_ready",
			},
		};
	}

	const apiKey = await getUserCredential(db, {
		providerId: modelDefinition.providerId,
		secret: encryptionSecret(env),
		userId,
	});

	if (!apiKey) {
		return {
			readiness: {
				message: CONNECT_FIRST_MESSAGE,
				modelId,
				modelName: modelDefinition.name,
				providerId: modelDefinition.providerId,
				providerName: modelDefinition.providerName,
				reason: "missing_user_credential",
				source,
				status: "not_ready",
			},
		};
	}

	const built = buildResolvedLanguageModel({ apiKey, modelDefinition, reasoningEffort });
	const readiness: CuratorModelReadinessReady = {
		modelId,
		modelName: modelDefinition.name,
		providerId: modelDefinition.providerId,
		providerName: modelDefinition.providerName,
		reasoningEffort,
		source,
		status: "ready",
	};

	return {
		readiness,
		resolved: {
			model: built.model,
			modelDefinition: built.modelDefinition,
			providerId: built.providerId,
			providerModelId: built.providerModelId,
			readiness,
			reasoningEffort,
			reasoningProviderOptions: built.reasoningProviderOptions,
		},
	};
};

/**
 * Report whether the Curator can run for this user without resolving a usable
 * model handle — true once a saved credential exists for the effective Curator
 * model's provider, otherwise a structured connect-first state child surfaces
 * gate creation on. Never throws for the ordinary not-ready paths; it is the
 * read the UI polls.
 */
export const checkCuratorModelReadiness = async (
	input: CuratorModelInput,
): Promise<CuratorModelReadiness> => {
	const evaluation = await evaluateCuratorModel(input);
	return evaluation.readiness;
};

export class CuratorModelUnavailableError extends Error {
	readonly readiness: CuratorModelReadinessNotReady;

	constructor(readiness: CuratorModelReadinessNotReady) {
		super(readiness.message);
		this.name = "CuratorModelUnavailableError";
		this.readiness = readiness;
	}
}

/**
 * Resolve a usable Curator `LanguageModelV3` from the user's product credential,
 * ungated by any Thinkspace Permission. Throws `CuratorModelUnavailableError`
 * (carrying the structured readiness) when the Curator cannot run — the caller
 * fails closed and points the user to connect a provider.
 */
export const resolveCuratorModel = async (
	input: CuratorModelInput,
): Promise<ResolvedCuratorModel> => {
	const evaluation = await evaluateCuratorModel(input);
	if (evaluation.readiness.status !== "ready" || !evaluation.resolved) {
		const readiness =
			evaluation.readiness.status === "not_ready"
				? evaluation.readiness
				: ({
						message: "The selected Curator model configuration could not be resolved.",
						modelId: evaluation.readiness.modelId,
						reason: "resolution_failed",
						source: evaluation.readiness.source,
						status: "not_ready",
					} satisfies CuratorModelReadinessNotReady);
		throw new CuratorModelUnavailableError(readiness);
	}
	return evaluation.resolved;
};

export const getUserCuratorModelSettings = async (
	db: ProductDb,
	userId: string,
): Promise<CuratorModelSettings | null> => {
	const [settings] = await db
		.select({
			curatorModel: userProductSettings.curatorModel,
			defaultModel: userProductSettings.defaultModel,
			reasoningEffort: userProductSettings.reasoningEffort,
		})
		.from(userProductSettings)
		.where(eq(userProductSettings.userId, userId))
		.limit(1);

	return settings ?? null;
};
