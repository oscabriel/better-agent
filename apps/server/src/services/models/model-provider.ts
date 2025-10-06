import { env } from "cloudflare:workers";
import { anthropic, createAnthropic } from "@ai-sdk/anthropic";
import { google } from "@ai-sdk/google";
import { createOpenAI, openai } from "@ai-sdk/openai";
import {
	createProviderRegistry,
	customProvider,
	defaultSettingsMiddleware,
	wrapLanguageModel,
} from "ai";
import { getModelDefinition } from "./model-catalog";

const openrouterApiKey =
	env?.OPENROUTER_API_KEY ?? process.env.OPENROUTER_API_KEY ?? "";

const openrouterHeaders: Record<string, string> = {};

if (env?.CORS_ORIGIN) {
	openrouterHeaders["HTTP-Referer"] = env.CORS_ORIGIN;
}

if (process.env.NODE_ENV === "production") {
	globalThis.AI_SDK_DEFAULT_PROVIDER = google;
}

const openrouter = createOpenAI({
	baseURL: "https://openrouter.ai/api/v1",
	apiKey: openrouterApiKey,
	headers: openrouterHeaders,
});

export const registry = createProviderRegistry({
	openai,
	anthropic,
	google: customProvider({
		languageModels: {
			"gemini-2.5-flash-lite": google("gemini-2.5-flash-lite"),
			"gemini-2.5-flash": google("gemini-2.5-flash"),
			"gemini-2.5-pro": google("gemini-2.5-pro"),
		},
		fallbackProvider: google,
	}),
	openrouter: customProvider({
		languageModels: {
			"meta-llama/llama-4-scout:free": openrouter(
				"meta-llama/llama-4-scout:free",
			),
			"meta-llama/llama-3.3-70b-instruct:free": openrouter(
				"meta-llama/llama-3.3-70b-instruct:free",
			),
			"meta-llama/llama-4-maverick": openrouter("meta-llama/llama-4-maverick"),
		},
		fallbackProvider: openrouter,
	}),
});

/**
 * Get model instance with optional user API key for BYOK support.
 * Creates dynamic provider instances when user API keys are provided.
 */
export function getModelFromId(modelId: string, userApiKey?: string) {
	const [provider, ...modelSegments] = modelId.split(":");
	const model = modelSegments.join(":");

	if (!provider || !model) {
		throw new Error(`Invalid model identifier: ${modelId}`);
	}

	if (userApiKey) {
		switch (provider) {
			case "openai":
				return createOpenAI({ apiKey: userApiKey })(model);
			case "anthropic":
				return createAnthropic({ apiKey: userApiKey })(model);
			case "google": {
				const customGoogle = createOpenAI({
					baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
					apiKey: userApiKey,
				});
				return customGoogle(model);
			}
			case "openrouter":
				return createOpenAI({
					baseURL: "https://openrouter.ai/api/v1",
					apiKey: userApiKey,
				})(model);
		}
	}

	// biome-ignore lint/suspicious/noExplicitAny: Registry requires specific literal types but accepts any valid provider:model string at runtime
	return registry.languageModel(`${provider}:${model}` as any);
}

/**
 * Get model with reasoning middleware for models that support extended thinking.
 * Applies reasoning extraction and provider-specific configuration.
 */
export function getReasoningModel(
	modelId: string,
	userApiKey?: string,
	reasoningEffort: "off" | "low" | "medium" | "high" = "medium",
) {
	const baseModel = getModelFromId(modelId, userApiKey);
	const [provider, model] = modelId.split(":");

	if (reasoningEffort === "off") {
		return baseModel;
	}

	if (provider === "openai" && model.startsWith("o")) {
		return wrapLanguageModel({
			model: baseModel,
			middleware: defaultSettingsMiddleware({
				settings: {
					providerOptions: {
						openai: {
							reasoningEffort, // User-configurable: 'low' | 'medium' | 'high'
						},
					},
				},
			}),
		});
	}

	if (provider === "anthropic" && model.includes("sonnet")) {
		const budgetMap = {
			low: 10000,
			medium: 32000,
			high: 64000,
		};

		return wrapLanguageModel({
			model: baseModel,
			middleware: defaultSettingsMiddleware({
				settings: {
					providerOptions: {
						anthropic: {
							thinking: {
								type: "enabled",
								budgetTokens: budgetMap[reasoningEffort],
							},
						},
					},
				},
			}),
		});
	}

	if (provider === "google" && model.includes("gemini")) {
		const budgetMap = {
			low: 2048,
			medium: 8192,
			high: 16384,
		};

		return wrapLanguageModel({
			model: baseModel,
			middleware: defaultSettingsMiddleware({
				settings: {
					providerOptions: {
						google: {
							thinkingConfig: {
								thinkingBudget: budgetMap[reasoningEffort],
								includeThoughts: true, // Required to receive reasoning tokens
							},
						},
					},
				},
			}),
		});
	}

	return baseModel;
}

export class ModelProviderService {
	getModel(
		modelId: string,
		userApiKey?: string,
		reasoningEffort: "off" | "low" | "medium" | "high" = "medium",
	) {
		const modelDefinition = getModelDefinition(modelId);
		const isReasoningModel =
			modelDefinition?.capabilities.includes("reasoning");

		if (isReasoningModel) {
			return getReasoningModel(modelId, userApiKey, reasoningEffort);
		}

		return getModelFromId(modelId, userApiKey);
	}
}
