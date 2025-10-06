/**
 * User Provider Registry Factory
 *
 * Creates per-user provider registries that merge:
 * 1. Base app-provided free models
 * 2. User BYOK providers (OpenAI, Anthropic, Google)
 * 3. User OpenRouter key (catch-all for all models)
 *
 * Each registry is built dynamically based on user's available API keys.
 */

import {
	anthropic as anthropicProvider,
	createAnthropic,
} from "@ai-sdk/anthropic";
import { google as googleProvider } from "@ai-sdk/google";
import { createOpenAI, openai as openaiProvider } from "@ai-sdk/openai";
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
		const openaiProvider = createOpenAI({ apiKey: userApiKeys.openai });

		const reasoningEffortValue = reasoningConfig.enabled
			? reasoningConfig.effort
			: undefined;

		userProviders.openai = customProvider({
			languageModels: {
				"o3-mini": reasoningEffortValue
					? wrapLanguageModel({
							model: openaiProvider("o3-mini"),
							middleware: defaultSettingsMiddleware({
								settings: {
									providerOptions: {
										openai: {
											reasoningEffort: reasoningEffortValue,
										},
									},
								},
							}),
						})
					: openaiProvider("o3-mini"),

				"o4-mini": reasoningEffortValue
					? wrapLanguageModel({
							model: openaiProvider("o4-mini"),
							middleware: defaultSettingsMiddleware({
								settings: {
									providerOptions: {
										openai: {
											reasoningEffort: reasoningEffortValue,
										},
									},
								},
							}),
						})
					: openaiProvider("o4-mini"),

				o3: reasoningEffortValue
					? wrapLanguageModel({
							model: openaiProvider("o3"),
							middleware: defaultSettingsMiddleware({
								settings: {
									providerOptions: {
										openai: {
											reasoningEffort: reasoningEffortValue,
										},
									},
								},
							}),
						})
					: openaiProvider("o3"),

				"o3-pro": reasoningEffortValue
					? wrapLanguageModel({
							model: openaiProvider("o3-pro"),
							middleware: defaultSettingsMiddleware({
								settings: {
									providerOptions: {
										openai: {
											reasoningEffort: reasoningEffortValue,
										},
									},
								},
							}),
						})
					: openaiProvider("o3-pro"),

				"gpt-4o": openaiProvider("gpt-4o"),
				"gpt-4o-mini": openaiProvider("gpt-4o-mini"),
				"gpt-4.1": openaiProvider("gpt-4.1"),
				"gpt-4.1-mini": openaiProvider("gpt-4.1-mini"),
				"gpt-4.1-nano": openaiProvider("gpt-4.1-nano"),
				"gpt-5": openaiProvider("gpt-5"),
			},
			fallbackProvider: openaiProvider,
		});
	}

	if (userApiKeys.anthropic) {
		const anthropicProvider = createAnthropic({
			apiKey: userApiKeys.anthropic,
		});

		const budgetMap = {
			low: 10000,
			medium: 32000,
			high: 64000,
		};
		const budgetTokens = reasoningConfig.enabled
			? budgetMap[reasoningConfig.effort]
			: undefined;

		const createAnthropicModel = (
			modelId: string,
			supportsReasoning = false,
		) => {
			if (!supportsReasoning || !budgetTokens) {
				return anthropicProvider(modelId);
			}

			return wrapLanguageModel({
				model: anthropicProvider(modelId),
				middleware: defaultSettingsMiddleware({
					settings: {
						providerOptions: {
							anthropic: {
								thinking: {
									type: "enabled",
									budgetTokens,
								},
							},
						},
					},
				}),
			});
		};

		userProviders.anthropic = customProvider({
			languageModels: {
				"claude-opus-4-20250514": createAnthropicModel(
					"claude-opus-4-20250514",
					true,
				),
				"claude-sonnet-4-5-20250929": createAnthropicModel(
					"claude-sonnet-4-5-20250929",
					true,
				),
				"claude-sonnet-4-20250514": createAnthropicModel(
					"claude-sonnet-4-20250514",
					true,
				),
				"claude-3-7-sonnet-20250219": createAnthropicModel(
					"claude-3-7-sonnet-20250219",
					true,
				),
				"claude-3-5-haiku-20241022": createAnthropicModel(
					"claude-3-5-haiku-20241022",
					false,
				),
			},
			fallbackProvider: anthropicProvider,
		});
	}

	if (userApiKeys.google) {
		const customGoogle = createOpenAI({
			baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
			apiKey: userApiKeys.google,
		});

		const budgetMap = {
			low: 2048,
			medium: 8192,
			high: 16384,
		};
		const thinkingBudget = reasoningConfig.enabled
			? budgetMap[reasoningConfig.effort]
			: undefined;

		const createGoogleModel = (modelId: string, supportsReasoning = false) => {
			if (!supportsReasoning || !thinkingBudget) {
				return customGoogle(modelId);
			}

			return wrapLanguageModel({
				model: customGoogle(modelId),
				middleware: defaultSettingsMiddleware({
					settings: {
						providerOptions: {
							google: {
								thinkingConfig: {
									thinkingBudget,
									includeThoughts: true, // Required to receive reasoning tokens
								},
							},
						},
					},
				}),
			});
		};

		userProviders.google = customProvider({
			languageModels: {
				"gemini-2.5-flash-lite": createGoogleModel(
					"gemini-2.5-flash-lite",
					true,
				),
				"gemini-2.0-flash-lite": createGoogleModel(
					"gemini-2.0-flash-lite",
					false,
				),
				"gemini-2.0-flash": createGoogleModel("gemini-2.0-flash", false),
				"gemini-2.5-flash": createGoogleModel("gemini-2.5-flash", true),
				"gemini-2.5-pro": createGoogleModel("gemini-2.5-pro", true),
			},
			fallbackProvider: googleProvider,
		});
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
			(() => {
				const budgetMap = {
					low: 2048,
					medium: 8192,
					high: 16384,
				};
				const thinkingBudget = reasoningConfig.enabled
					? budgetMap[reasoningConfig.effort]
					: undefined;

				const createFallbackGoogleModel = (
					modelId: string,
					supportsReasoning = false,
				) => {
					if (!supportsReasoning || !thinkingBudget) {
						return googleProvider(modelId);
					}

					return wrapLanguageModel({
						model: googleProvider(modelId),
						middleware: defaultSettingsMiddleware({
							settings: {
								providerOptions: {
									google: {
										thinkingConfig: {
											thinkingBudget,
											includeThoughts: true,
										},
									},
								},
							},
						}),
					});
				};

				return customProvider({
					languageModels: {
						"gemini-2.5-flash-lite": createFallbackGoogleModel(
							"gemini-2.5-flash-lite",
							true,
						),
						"gemini-2.0-flash-lite": createFallbackGoogleModel(
							"gemini-2.0-flash-lite",
							false,
						),
						"gemini-2.0-flash": createFallbackGoogleModel(
							"gemini-2.0-flash",
							false,
						),
					},
					fallbackProvider: googleProvider,
				});
			})(),
	};

	return createProviderRegistry(finalProviders);
}
