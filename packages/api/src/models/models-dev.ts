import type { CloudflareEnv } from "@better-agent/env/types";
import { z } from "zod";

import { MODEL_PROVIDER_IDS } from "./catalog";
import type { ModelCapability, ModelCatalogEntry, ModelProviderId } from "./catalog";
import { createStaticModelCatalog, ModelCatalogError } from "./model-catalog";
import type { ModelCatalog } from "./model-catalog";

export const MODELS_DEV_API_URL = "https://models.dev/api.json";
export const MODEL_CATALOG_CACHE_KEY = "models-dev:catalog:v1";
export const MODEL_CATALOG_CACHE_TTL_SECONDS = 3600;

const MODELS_DEV_SOURCE = `models.dev API catalog (${MODELS_DEV_API_URL}).`;
const CATALOG_UNAVAILABLE_MESSAGE =
	"The model catalog is temporarily unavailable. Try again shortly.";

/**
 * Structural subset of a Workers KV namespace used to cache the mapped
 * catalog. A dedicated `MODEL_CATALOG_KV` binding satisfies this in
 * production; tests inject an in-memory implementation.
 */
export interface ModelCatalogCache {
	get: (key: string) => Promise<string | null>;
	put: (key: string, value: string, options?: { expirationTtl?: number }) => Promise<void>;
}

const modelsDevModelSchema = z.looseObject({
	cost: z.looseObject({ input: z.number(), output: z.number() }).optional(),
	id: z.string(),
	limit: z.looseObject({ context: z.number(), output: z.number().optional() }),
	modalities: z.looseObject({ input: z.array(z.string()), output: z.array(z.string()) }).optional(),
	name: z.string(),
	reasoning: z.boolean(),
	status: z.string().optional(),
	tool_call: z.boolean(),
});

const modelsDevProviderSchema = z.looseObject({
	id: z.string(),
	models: z.record(z.string(), modelsDevModelSchema),
	name: z.string(),
});

const modelsDevPayloadSchema = z.record(z.string(), modelsDevProviderSchema);

type ModelsDevModel = z.infer<typeof modelsDevModelSchema>;
type ModelsDevPayload = z.infer<typeof modelsDevPayloadSchema>;

const providerIdSchema = z.enum(MODEL_PROVIDER_IDS);

const cachedCatalogEntrySchema = z.object({
	capabilities: z.array(z.enum(["text", "tools", "images", "audio", "video", "pdf", "reasoning"])),
	contextWindow: z.number(),
	costPer1MTokens: z.object({ input: z.number(), output: z.number() }).optional(),
	description: z.string(),
	id: z.string(),
	maxOutputTokens: z.number().optional(),
	name: z.string(),
	providerId: providerIdSchema,
	providerName: z.string(),
	reasoning: z.enum([
		"none",
		"openai_reasoning_effort",
		"anthropic_thinking",
		"google_thinking_config",
	]),
	reviewedAt: z.string(),
	source: z.string(),
});

const cachedCatalogSchema = z.object({ entries: z.array(cachedCatalogEntrySchema) });

const REASONING_KIND_BY_PROVIDER: Record<ModelProviderId, ModelCatalogEntry["reasoning"]> = {
	anthropic: "anthropic_thinking",
	google: "google_thinking_config",
	openai: "openai_reasoning_effort",
};

const MODALITY_CAPABILITIES: Record<string, ModelCapability> = {
	audio: "audio",
	image: "images",
	pdf: "pdf",
	video: "video",
};

const EXCLUDED_MODEL_STATUSES = new Set(["alpha", "deprecated"]);

const toCapabilities = (model: ModelsDevModel): ModelCapability[] => {
	const capabilities: ModelCapability[] = ["text"];

	if (model.tool_call) {
		capabilities.push("tools");
	}

	for (const modality of model.modalities?.input ?? []) {
		const capability = MODALITY_CAPABILITIES[modality];
		if (capability && !capabilities.includes(capability)) {
			capabilities.push(capability);
		}
	}

	if (model.reasoning) {
		capabilities.push("reasoning");
	}

	return capabilities;
};

const toCatalogEntry = ({
	model,
	modelKey,
	providerId,
	providerName,
	reviewedAt,
}: {
	model: ModelsDevModel;
	modelKey: string;
	providerId: ModelProviderId;
	providerName: string;
	reviewedAt: string;
}): ModelCatalogEntry => ({
	capabilities: toCapabilities(model),
	contextWindow: model.limit.context,
	costPer1MTokens: model.cost ? { input: model.cost.input, output: model.cost.output } : undefined,
	description: `${model.name} from ${providerName}, listed in the models.dev catalog.`,
	id: `${providerId}:${modelKey}`,
	maxOutputTokens: model.limit.output,
	name: model.name,
	providerId,
	providerName,
	reasoning: model.reasoning ? REASONING_KIND_BY_PROVIDER[providerId] : "none",
	reviewedAt,
	source: MODELS_DEV_SOURCE,
});

/**
 * Maps a validated models.dev payload onto ModelCatalogEntry values:
 * providers without an AI SDK factory in `MODEL_PROVIDER_IDS` are dropped,
 * as are models whose status is `deprecated` or `alpha`.
 */
export const mapModelsDevPayload = (
	payload: ModelsDevPayload,
	reviewedAt: string,
): ModelCatalogEntry[] => {
	const entries: ModelCatalogEntry[] = [];

	for (const providerId of MODEL_PROVIDER_IDS) {
		const provider = payload[providerId];
		if (!provider) {
			continue;
		}

		for (const [modelKey, model] of Object.entries(provider.models)) {
			if (model.status && EXCLUDED_MODEL_STATUSES.has(model.status)) {
				continue;
			}

			entries.push(
				toCatalogEntry({
					model,
					modelKey,
					providerId,
					providerName: provider.name,
					reviewedAt,
				}),
			);
		}
	}

	return entries.toSorted((a, b) => a.id.localeCompare(b.id));
};

const defaultFetchCatalogPayload = async (): Promise<unknown> => {
	const response = await fetch(MODELS_DEV_API_URL);

	if (!response.ok) {
		throw new ModelCatalogError(
			"catalog_unavailable",
			`models.dev responded with status ${response.status}.`,
		);
	}

	return await response.json();
};

export interface ModelsDevModelCatalogOptions {
	cache?: ModelCatalogCache;
	cacheTtlSeconds?: number;
	fallbackCatalog?: ModelCatalog;
	fetchCatalogPayload?: () => Promise<unknown>;
	now?: () => number;
}

/**
 * Production ModelCatalog adapter backed by the models.dev API: the mapped
 * catalog is cached in a dedicated KV namespace for ~1 hour, and the
 * reviewed static catalog serves as the bundled snapshot fallback whenever
 * the fetch fails or the payload does not validate. A typed
 * ModelCatalogError surfaces only when both sources are unavailable.
 */
export const createModelsDevModelCatalog = ({
	cache,
	cacheTtlSeconds = MODEL_CATALOG_CACHE_TTL_SECONDS,
	fallbackCatalog = createStaticModelCatalog(),
	fetchCatalogPayload = defaultFetchCatalogPayload,
	now = Date.now,
}: ModelsDevModelCatalogOptions = {}): ModelCatalog => {
	const readCachedEntries = async (): Promise<ModelCatalogEntry[] | null> => {
		if (!cache) {
			return null;
		}

		try {
			const cached = await cache.get(MODEL_CATALOG_CACHE_KEY);
			if (!cached) {
				return null;
			}

			const parsed = cachedCatalogSchema.parse(JSON.parse(cached));
			return parsed.entries.filter((entry) =>
				entry.id.startsWith(`${entry.providerId}:`),
			) as ModelCatalogEntry[];
		} catch {
			return null;
		}
	};

	const fetchAndCacheEntries = async (): Promise<ModelCatalogEntry[]> => {
		const payload = modelsDevPayloadSchema.parse(await fetchCatalogPayload());
		const reviewedAt = new Date(now()).toISOString().slice(0, 10);
		const entries = mapModelsDevPayload(payload, reviewedAt);

		if (entries.length === 0) {
			throw new ModelCatalogError(
				"catalog_unavailable",
				"The models.dev payload contained no supported models.",
			);
		}

		await cache?.put(MODEL_CATALOG_CACHE_KEY, JSON.stringify({ entries }), {
			expirationTtl: cacheTtlSeconds,
		});

		return entries;
	};

	const listModels = async (): Promise<ModelCatalogEntry[]> => {
		const cached = await readCachedEntries();
		if (cached) {
			return cached;
		}

		try {
			return await fetchAndCacheEntries();
		} catch {
			try {
				return await fallbackCatalog.listModels();
			} catch {
				throw new ModelCatalogError("catalog_unavailable", CATALOG_UNAVAILABLE_MESSAGE);
			}
		}
	};

	return {
		getModel: async (modelId) => {
			const entries = await listModels();
			return entries.find((entry) => entry.id === modelId) ?? null;
		},
		listModels,
		sourceId: "models_dev",
	};
};

/**
 * The product's ModelCatalog: models.dev kept current via the dedicated
 * `MODEL_CATALOG_KV` cache, with the reviewed static catalog as the
 * snapshot fallback.
 */
export const createProductModelCatalog = (
	env: Pick<CloudflareEnv, "MODEL_CATALOG_KV">,
): ModelCatalog => createModelsDevModelCatalog({ cache: env.MODEL_CATALOG_KV });
