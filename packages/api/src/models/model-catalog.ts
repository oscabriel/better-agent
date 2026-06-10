import { getModelCatalog, getModelDefinition } from "./catalog";
import type { ModelCatalogEntry } from "./catalog";

/**
 * A model id that has been validated against a ModelCatalog. Raw strings from
 * HTTP input, Curator tool calls, or stored rows must pass through
 * `validateCatalogModelId` (or an equivalent catalog lookup) before they can
 * enter an Agent Profile revision.
 */
export type CatalogModelId = ModelCatalogEntry["id"];

export const MODEL_CATALOG_SOURCE_IDS = ["static_reviewed", "models_dev"] as const;
export type ModelCatalogSourceId = (typeof MODEL_CATALOG_SOURCE_IDS)[number];

/**
 * Seam for "which models can a user pick for a Thinkspace Agent?". The
 * domain only sees `ModelCatalogEntry` values; where they come from (the
 * reviewed static list today, the models.dev API later) stays behind this
 * interface.
 */
export interface ModelCatalog {
	getModel: (modelId: string) => Promise<ModelCatalogEntry | null>;
	listModels: () => Promise<ModelCatalogEntry[]>;
	sourceId: ModelCatalogSourceId;
}

export type ModelCatalogErrorKind = "catalog_unavailable" | "unknown_model";

export class ModelCatalogError extends Error {
	readonly kind: ModelCatalogErrorKind;
	readonly modelId?: string;

	constructor(kind: ModelCatalogErrorKind, message: string, modelId?: string) {
		super(message);
		this.name = "ModelCatalogError";
		this.kind = kind;
		this.modelId = modelId;
	}
}

export const createUnknownCatalogModelError = (modelId: string): ModelCatalogError =>
	new ModelCatalogError(
		"unknown_model",
		`The model "${modelId}" is not in the supported model catalog.`,
		modelId,
	);

/** Production adapter over the reviewed static catalog in `./catalog`. */
export const createStaticModelCatalog = (): ModelCatalog => ({
	getModel: (modelId) => Promise.resolve(getModelDefinition(modelId)),
	listModels: () => Promise.resolve(getModelCatalog()),
	sourceId: "static_reviewed",
});

/** Test adapter backed by an in-memory entry list. */
export const createMemoryModelCatalog = (entries: ModelCatalogEntry[]): ModelCatalog => ({
	getModel: (modelId) => Promise.resolve(entries.find((entry) => entry.id === modelId) ?? null),
	listModels: () => Promise.resolve([...entries]),
	sourceId: "static_reviewed",
});

const MODELS_DEV_NOT_IMPLEMENTED_MESSAGE =
	"The models.dev model catalog adapter is not implemented yet.";

/**
 * Future production adapter that keeps the catalog current from the
 * models.dev API. Architecture slot only: every method fails with a typed
 * ModelCatalogError until the behavior slice implements it.
 */
export const createModelsDevModelCatalog = (): ModelCatalog => ({
	getModel: () =>
		Promise.reject(
			new ModelCatalogError("catalog_unavailable", MODELS_DEV_NOT_IMPLEMENTED_MESSAGE),
		),
	listModels: () =>
		Promise.reject(
			new ModelCatalogError("catalog_unavailable", MODELS_DEV_NOT_IMPLEMENTED_MESSAGE),
		),
	sourceId: "models_dev",
});

/**
 * Edge validator: narrows a raw string to a CatalogModelId by looking it up
 * in the given catalog, or throws a typed ModelCatalogError.
 */
export const validateCatalogModelId = async (
	catalog: ModelCatalog,
	modelId: string,
): Promise<{ entry: ModelCatalogEntry; modelId: CatalogModelId }> => {
	const entry = await catalog.getModel(modelId.trim());

	if (!entry) {
		throw createUnknownCatalogModelError(modelId);
	}

	return { entry, modelId: entry.id };
};
