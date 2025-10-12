import { STATIC_MODELS } from "./catalog";
import type { ModelDefinition } from "./types";

export function getModelCatalog(): ModelDefinition[] {
	return STATIC_MODELS;
}

export function getModelDefinition(modelId: string): ModelDefinition | null {
	return STATIC_MODELS.find((model) => model.id === modelId) ?? null;
}

export function getFreeModels(): ModelDefinition[] {
	return STATIC_MODELS.filter((model) => model.access === "free");
}

export function getBYOKModels(): ModelDefinition[] {
	return STATIC_MODELS.filter((model) => model.access === "byok");
}

export function getUserAvailableModels(
	userApiKeys: Record<string, string>,
): ModelDefinition[] {
	return STATIC_MODELS.filter((model) => {
		if (model.access === "free") return true;
		const provider = model.id.split(":")[0];
		return Boolean(userApiKeys[provider]);
	});
}

export function validateModelAccess(
	modelId: string,
	userApiKeys: Record<string, string>,
): boolean {
	const model = getModelDefinition(modelId);
	if (!model) return false;

	if (model.access === "byok") {
		const provider = modelId.split(":")[0];
		return !!userApiKeys[provider];
	}

	return true;
}

export function requiresAPIKey(modelId: string): boolean {
	const model = getModelDefinition(modelId);
	return model?.access === "byok" || false;
}

export function getModelDisplayName(modelId: string): string {
	const model = getModelDefinition(modelId);
	return model?.name ?? modelId;
}

// Model Provider Resolution

interface UserApiKeys {
	openai?: string;
	anthropic?: string;
	google?: string;
}

interface ResolvedProvider {
	/** The provider:model string to use with the registry */
	modelId: string;
	/** The provider being used */
	provider: string;
	/** The API key to use (if any) */
	apiKey?: string;
}

/**
 * Resolves which provider and model ID to use for a given model.
 *
 * Resolution priority:
 * 1. Free models always use app-provided keys (base registry)
 * 2. BYOK models: require native provider API key
 * 3. Error if no available provider
 */
export function resolveModelProvider(
	modelId: string,
	userApiKeys: UserApiKeys,
): ResolvedProvider {
	const model = getModelDefinition(modelId);
	if (!model) {
		throw new Error(`Unknown model: ${modelId}`);
	}

	const [provider] = modelId.split(":");

	if (model.access === "free") {
		return {
			modelId,
			provider,
		};
	}

	if (userApiKeys[provider as keyof UserApiKeys]) {
		return {
			modelId,
			provider,
			apiKey: userApiKeys[provider as keyof UserApiKeys],
		};
	}

	throw new Error(
		`No available provider for model: ${modelId}. Please add an API key for ${provider}.`,
	);
}

/**
 * Checks if a model is available to the user.
 */
export function isModelAvailable(
	modelId: string,
	userApiKeys: UserApiKeys,
): boolean {
	try {
		resolveModelProvider(modelId, userApiKeys);
		return true;
	} catch {
		return false;
	}
}
