/**
 * Base Application Provider Registry
 *
 * This registry contains app-provided API keys for free-tier models.
 * It serves as the foundation for all user registries.
 */

import { anthropic } from "@ai-sdk/anthropic";
import { google } from "@ai-sdk/google";
import { openai } from "@ai-sdk/openai";
import { createProviderRegistry, customProvider } from "ai";

/**
 * Base registry with app-provided providers for free models.
 * This registry is used when users don't have their own API keys.
 */
export const baseAppRegistry = createProviderRegistry({
	openai: customProvider({
		languageModels: {
			"gpt-4o-mini": openai("gpt-4o-mini"),
			"gpt-4.1-mini": openai("gpt-4.1-mini"),
			"gpt-4.1-nano": openai("gpt-4.1-nano"),
		},
		fallbackProvider: openai,
	}),

	anthropic,

	google: customProvider({
		languageModels: {
			"gemini-2.5-flash-lite": google("gemini-2.5-flash-lite"),
			"gemini-2.0-flash-lite": google("gemini-2.0-flash-lite"),
			"gemini-2.0-flash": google("gemini-2.0-flash"),
		},
		fallbackProvider: google,
	}),
});
