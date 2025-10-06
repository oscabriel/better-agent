export interface ModelDefinition {
	id: string;
	name: string;
	provider: string;
	description: string;
	access: "free" | "byok";
	capabilities: string[];
	contextWindow: number;
	maxOutputTokens?: number;
	costPer1MTokens?: {
		input: number;
		output: number;
	};

	/**
	 * Provider sources for multi-provider access.
	 * Allows the same model to be accessed via different providers.
	 */
	providerSources?: {
		/** Native provider model ID (e.g., "anthropic:claude-sonnet-4") */
		native?: string;
		/** OpenRouter provider model ID (e.g., "openrouter:anthropic/claude-sonnet-4") */
		openrouter?: string;
	};

	/**
	 * Provider priority when multiple sources are available.
	 * Default: 'native' (prefer native provider over OpenRouter)
	 */
	priority?: "native" | "openrouter";
}

export const DEFAULT_MODEL_ID = "google:gemini-2.5-flash-lite";
