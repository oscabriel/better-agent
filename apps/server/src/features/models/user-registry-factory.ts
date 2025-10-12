/**
 * User Provider Registry Factory
 *
 * Creates per-user provider registries that merge:
 * 1. Base app-provided free models
 * 2. User BYOK providers (OpenAI, Anthropic, Google)
 *
 * Each registry is built dynamically based on user's available API keys.
 */

import {
	anthropic as anthropicProvider,
	createAnthropic,
} from "@ai-sdk/anthropic";
import { google as googleProvider } from "@ai-sdk/google";
import { createOpenAI, openai as openaiProvider } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";
import {
	createProviderRegistry,
	customProvider,
	defaultSettingsMiddleware,
	wrapLanguageModel,
} from "ai";

interface UserApiKeys {
	openai?: string;
	anthropic?: string;
	google?: string;
}

interface ReasoningConfig {
	enabled: boolean;
	effort: "low" | "medium" | "high";
}

// Shared budget mappings for reasoning/thinking across providers
const ANTHROPIC_BUDGET_MAP = {
	low: 10000,
	medium: 32000,
	high: 64000,
} as const;

const GOOGLE_THINKING_BUDGET_MAP = {
	low: 2048,
	medium: 8192,
	high: 16384,
} as const;

/**
 * Generic helper to wrap a model with reasoning/thinking middleware
 */
function wrapWithReasoning<TProvider extends string>(
	model: LanguageModel,
	provider: TProvider,
	config: {
		budgetTokens?: number;
		reasoningEffort?: string;
		thinkingBudget?: number;
		includeThoughts?: boolean;
	},
) {
	if (provider === "openai" && config.reasoningEffort) {
		return wrapLanguageModel({
			// biome-ignore lint/suspicious/noExplicitAny: AI SDK type compatibility
			model: model as any,
			middleware: defaultSettingsMiddleware({
				settings: {
					providerOptions: {
						openai: {
							reasoningEffort: config.reasoningEffort,
						},
					},
				},
			}),
		});
	}

	if (provider === "anthropic" && config.budgetTokens) {
		return wrapLanguageModel({
			// biome-ignore lint/suspicious/noExplicitAny: AI SDK type compatibility
			model: model as any,
			middleware: defaultSettingsMiddleware({
				settings: {
					providerOptions: {
						anthropic: {
							thinking: {
								type: "enabled",
								budgetTokens: config.budgetTokens,
							},
						},
					},
				},
			}),
		});
	}

	if (provider === "google" && config.thinkingBudget) {
		return wrapLanguageModel({
			// biome-ignore lint/suspicious/noExplicitAny: AI SDK type compatibility
			model: model as any,
			middleware: defaultSettingsMiddleware({
				settings: {
					providerOptions: {
						google: {
							thinkingConfig: {
								thinkingBudget: config.thinkingBudget,
								includeThoughts: config.includeThoughts ?? true,
							},
						},
					},
				},
			}),
		});
	}

	return model;
}

/**
 * Creates OpenAI provider with BYOK support and reasoning models
 */
function createOpenAIProvider(
	apiKey: string,
	reasoningConfig: ReasoningConfig,
) {
	const openai = createOpenAI({ apiKey });
	const reasoningEffort = reasoningConfig.enabled
		? reasoningConfig.effort
		: undefined;

	const createModel = (modelId: string, supportsReasoning = false) => {
		const baseModel = openai(modelId);
		if (!supportsReasoning || !reasoningEffort) {
			return baseModel;
		}
		return wrapWithReasoning(baseModel, "openai", { reasoningEffort });
	};

	return customProvider({
		languageModels: {
			// biome-ignore lint/suspicious/noExplicitAny: Dynamic reasoning config requires flexible typing
			"o3-mini": createModel("o3-mini", true) as any,
			// biome-ignore lint/suspicious/noExplicitAny: Dynamic reasoning config requires flexible typing
			"o4-mini": createModel("o4-mini", true) as any,
			// biome-ignore lint/suspicious/noExplicitAny: Dynamic reasoning config requires flexible typing
			o3: createModel("o3", true) as any,
			// biome-ignore lint/suspicious/noExplicitAny: Dynamic reasoning config requires flexible typing
			"o3-pro": createModel("o3-pro", true) as any,
			// biome-ignore lint/suspicious/noExplicitAny: Dynamic reasoning config requires flexible typing
			"gpt-4o": createModel("gpt-4o") as any,
			// biome-ignore lint/suspicious/noExplicitAny: Dynamic reasoning config requires flexible typing
			"gpt-4o-mini": createModel("gpt-4o-mini") as any,
			// biome-ignore lint/suspicious/noExplicitAny: Dynamic reasoning config requires flexible typing
			"gpt-4.1": createModel("gpt-4.1") as any,
			// biome-ignore lint/suspicious/noExplicitAny: Dynamic reasoning config requires flexible typing
			"gpt-4.1-mini": createModel("gpt-4.1-mini") as any,
			// biome-ignore lint/suspicious/noExplicitAny: Dynamic reasoning config requires flexible typing
			"gpt-4.1-nano": createModel("gpt-4.1-nano") as any,
			// biome-ignore lint/suspicious/noExplicitAny: Dynamic reasoning config requires flexible typing
			"gpt-5": createModel("gpt-5") as any,
		},
		fallbackProvider: openai,
	});
}

/**
 * Creates Anthropic provider with BYOK support and extended thinking
 */
function createAnthropicProvider(
	apiKey: string,
	reasoningConfig: ReasoningConfig,
) {
	const anthropic = createAnthropic({ apiKey });
	const budgetTokens = reasoningConfig.enabled
		? ANTHROPIC_BUDGET_MAP[reasoningConfig.effort]
		: undefined;

	const createModel = (modelId: string, supportsReasoning = false) => {
		const baseModel = anthropic(modelId);
		if (!supportsReasoning || !budgetTokens) {
			return baseModel;
		}
		return wrapWithReasoning(baseModel, "anthropic", { budgetTokens });
	};

	return customProvider({
		languageModels: {
			"claude-opus-4-20250514": createModel(
				"claude-opus-4-20250514",
				true,
				// biome-ignore lint/suspicious/noExplicitAny: Dynamic reasoning config requires flexible typing
			) as any,
			"claude-sonnet-4-5-20250929": createModel(
				"claude-sonnet-4-5-20250929",
				true,
				// biome-ignore lint/suspicious/noExplicitAny: Dynamic reasoning config requires flexible typing
			) as any,
			"claude-sonnet-4-20250514": createModel(
				"claude-sonnet-4-20250514",
				true,
				// biome-ignore lint/suspicious/noExplicitAny: Dynamic reasoning config requires flexible typing
			) as any,
			"claude-3-7-sonnet-20250219": createModel(
				"claude-3-7-sonnet-20250219",
				true,
				// biome-ignore lint/suspicious/noExplicitAny: Dynamic reasoning config requires flexible typing
			) as any,
			"claude-3-5-haiku-20241022": createModel(
				"claude-3-5-haiku-20241022",
				false,
				// biome-ignore lint/suspicious/noExplicitAny: Dynamic reasoning config requires flexible typing
			) as any,
		},
		fallbackProvider: anthropic,
	});
}

/**
 * Creates Google provider with BYOK support and thinking config
 */
function createGoogleProvider(
	apiKey: string,
	reasoningConfig: ReasoningConfig,
	useOpenAICompatibility = false,
) {
	const google = useOpenAICompatibility
		? createOpenAI({
				baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
				apiKey,
			})
		: googleProvider;

	const thinkingBudget = reasoningConfig.enabled
		? GOOGLE_THINKING_BUDGET_MAP[reasoningConfig.effort]
		: undefined;

	const createModel = (modelId: string, supportsReasoning = false) => {
		const baseModel = google(modelId);
		if (!supportsReasoning || !thinkingBudget) {
			return baseModel;
		}
		return wrapWithReasoning(baseModel, "google", {
			thinkingBudget,
			includeThoughts: true,
		});
	};

	return customProvider({
		languageModels: {
			"gemini-2.5-flash-lite": createModel(
				"gemini-2.5-flash-lite",
				true,
				// biome-ignore lint/suspicious/noExplicitAny: Dynamic reasoning config requires flexible typing
			) as any,
			"gemini-2.0-flash-lite": createModel(
				"gemini-2.0-flash-lite",
				false,
				// biome-ignore lint/suspicious/noExplicitAny: Dynamic reasoning config requires flexible typing
			) as any,
			// biome-ignore lint/suspicious/noExplicitAny: Dynamic reasoning config requires flexible typing
			"gemini-2.0-flash": createModel("gemini-2.0-flash", false) as any,
			// biome-ignore lint/suspicious/noExplicitAny: Dynamic reasoning config requires flexible typing
			"gemini-2.5-flash": createModel("gemini-2.5-flash", true) as any,
			// biome-ignore lint/suspicious/noExplicitAny: Dynamic reasoning config requires flexible typing
			"gemini-2.5-pro": createModel("gemini-2.5-pro", true) as any,
		},
		fallbackProvider: google,
	});
}

/**
 * Creates a user-specific provider registry with BYOK support.
 * Merges app-provided free models with user's API keys.
 */
export function createUserProviderRegistry(
	userApiKeys: UserApiKeys,
	reasoningConfig: ReasoningConfig = { enabled: true, effort: "medium" },
) {
	// biome-ignore lint/suspicious/noExplicitAny: Dynamic provider construction requires any type
	const userProviders: Record<string, any> = {};

	if (userApiKeys.openai) {
		userProviders.openai = createOpenAIProvider(
			userApiKeys.openai,
			reasoningConfig,
		);
	}

	if (userApiKeys.anthropic) {
		userProviders.anthropic = createAnthropicProvider(
			userApiKeys.anthropic,
			reasoningConfig,
		);
	}

	if (userApiKeys.google) {
		userProviders.google = createGoogleProvider(
			userApiKeys.google,
			reasoningConfig,
			true, // Use OpenAI compatibility endpoint for BYOK
		);
	}

	// biome-ignore lint/suspicious/noExplicitAny: Dynamic provider construction requires any type
	const finalProviders: Record<string, any> = {
		openai:
			userProviders.openai ||
			customProvider({
				languageModels: {
					"gpt-4o-mini": openaiProvider("gpt-4o-mini"),
					"gpt-4.1-mini": openaiProvider("gpt-4.1-mini"),
					"gpt-4.1-nano": openaiProvider("gpt-4.1-nano"),
				},
				fallbackProvider: openaiProvider,
			}),

		anthropic: userProviders.anthropic || anthropicProvider,

		google:
			userProviders.google ||
			createGoogleProvider(
				"", // No API key for free tier
				reasoningConfig,
				false, // Use default Google provider for free models
			),
	};

	return createProviderRegistry(finalProviders);
}
