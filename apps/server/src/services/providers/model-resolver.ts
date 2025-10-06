/**
 * Model Provider Resolution Logic
 *
 * Determines which provider to use for a given model based on:
 * 1. Model access type (free vs BYOK)
 * 2. User's available API keys
 * 3. Provider priority (native > OpenRouter)
 */

import { getModelDefinition } from "@/server/services/models/model-catalog";

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

/**
 * Gets all available providers for a model.
 */
export function getAvailableProviders(
	modelId: string,
	userApiKeys: UserApiKeys,
): string[] {
	const model = getModelDefinition(modelId);
	if (!model) return [];

	const [provider] = modelId.split(":");
	const providers: string[] = [];

	if (model.access === "free") {
		providers.push(provider);
		return providers;
	}

	if (userApiKeys[provider as keyof UserApiKeys]) {
		providers.push("native");
	}

	return providers;
}

/**
 * Gets provider-specific models that user has access to.
 */
export function getProviderModels(
	provider: string,
	userApiKeys: UserApiKeys,
): string[] {
	const { getModelCatalog } = require("@/server/services/models/model-catalog");
	const catalog: Array<{
		id: string;
		access: "free" | "byok";
	}> = getModelCatalog();

	return catalog
		.filter((model: { id: string; access: "free" | "byok" }) => {
			const [modelProvider] = model.id.split(":");

			if (model.access === "free" && modelProvider === provider) {
				return true;
			}

			if (model.access === "byok" && modelProvider === provider) {
				return !!userApiKeys[provider as keyof UserApiKeys];
			}

			return false;
		})
		.map((model: { id: string }) => model.id);
}

/**
 * Validates that a user has access to a specific model.
 */
export function validateModelAccess(
	modelId: string,
	userApiKeys: UserApiKeys,
): { valid: boolean; reason?: string } {
	const model = getModelDefinition(modelId);

	if (!model) {
		return { valid: false, reason: "Model not found" };
	}

	if (model.access === "free") {
		return { valid: true };
	}

	const [provider] = modelId.split(":");

	if (userApiKeys[provider as keyof UserApiKeys]) {
		return { valid: true };
	}

	return {
		valid: false,
		reason: `Requires ${provider} API key`,
	};
}
