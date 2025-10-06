import type { ModelDefinition } from "@/server/domain/models";

const STATIC_MODELS: ModelDefinition[] = [
	{
		id: "openai:gpt-4o-mini",
		name: "GPT-4o mini",
		provider: "OpenAI",
		description:
			"App-provided GPT-4o mini access with 128K context and vision support.",
		access: "free",
		capabilities: ["text", "tools", "images"],
		contextWindow: 128_000,
		maxOutputTokens: 16_384,
		costPer1MTokens: { input: 0.15, output: 0.6 },
	},
	{
		id: "openai:gpt-4.1-mini",
		name: "GPT-4.1 mini",
		provider: "OpenAI",
		description: "App-provided GPT-4.1 mini with 1M context and tool support.",
		access: "free",
		capabilities: ["text", "tools", "images"],
		contextWindow: 1_047_576,
		maxOutputTokens: 32_768,
		costPer1MTokens: { input: 0.4, output: 1.6 },
	},
	{
		id: "openai:gpt-4.1-nano",
		name: "GPT-4.1 nano",
		provider: "OpenAI",
		description:
			"App-provided GPT-4.1 nano with million-token context for fast chats.",
		access: "free",
		capabilities: ["text", "tools", "images"],
		contextWindow: 1_047_576,
		maxOutputTokens: 32_768,
		costPer1MTokens: { input: 0.1, output: 0.4 },
	},
	{
		id: "google:gemini-2.5-flash-lite",
		name: "Gemini 2.5 Flash Lite",
		provider: "Google",
		description:
			"App-provided Gemini 2.5 Flash Lite with 1M context and multimodal I/O.",
		access: "free",
		capabilities: [
			"text",
			"tools",
			"images",
			"audio",
			"video",
			"pdf",
			"reasoning",
		],
		contextWindow: 1_048_576,
		maxOutputTokens: 65_536,
		costPer1MTokens: { input: 0.1, output: 0.4 },
	},
	{
		id: "google:gemini-2.0-flash-lite",
		name: "Gemini 2.0 Flash Lite",
		provider: "Google",
		description: "App-provided Gemini 2.0 Flash Lite with multimodal support.",
		access: "free",
		capabilities: ["text", "tools", "images", "audio", "video", "pdf"],
		contextWindow: 1_048_576,
		maxOutputTokens: 8_192,
		costPer1MTokens: { input: 0.075, output: 0.3 },
	},
	{
		id: "google:gemini-2.0-flash",
		name: "Gemini 2.0 Flash",
		provider: "Google",
		description:
			"Gemini 2.0 Flash with multimodal inputs and 8K output tokens.",
		access: "free",
		capabilities: ["text", "tools", "images", "audio", "video", "pdf"],
		contextWindow: 1_048_576,
		maxOutputTokens: 8_192,
		costPer1MTokens: { input: 0.1, output: 0.4 },
	},
	// Premium (BYOK) Models - OpenAI
	{
		id: "openai:gpt-4o",
		name: "GPT-4o",
		provider: "OpenAI",
		description: "Flagship GPT-4o multimodal model for production workloads.",
		access: "byok",
		capabilities: ["text", "tools", "images"],
		contextWindow: 128_000,
		maxOutputTokens: 16_384,
		costPer1MTokens: { input: 2.5, output: 10 },
	},
	{
		id: "openai:gpt-4.1",
		name: "GPT-4.1",
		provider: "OpenAI",
		description: "GPT-4.1 flagship with 1M context and vision support.",
		access: "byok",
		capabilities: ["text", "tools", "images"],
		contextWindow: 1_047_576,
		maxOutputTokens: 32_768,
		costPer1MTokens: { input: 2, output: 8 },
	},
	{
		id: "openai:gpt-5",
		name: "GPT-5",
		provider: "OpenAI",
		description:
			"Latest GPT-5 with 400K context, reasoning, and vision support.",
		access: "byok",
		capabilities: ["text", "tools", "images", "reasoning"],
		contextWindow: 400_000,
		maxOutputTokens: 128_000,
		costPer1MTokens: { input: 1.25, output: 10 },
	},
	{
		id: "openai:o3-mini",
		name: "o3-mini",
		provider: "OpenAI",
		description: "Compact o3 reasoning model with 200K context.",
		access: "byok",
		capabilities: ["text", "tools", "reasoning"],
		contextWindow: 200_000,
		maxOutputTokens: 100_000,
		costPer1MTokens: { input: 1.1, output: 4.4 },
	},
	{
		id: "openai:o4-mini",
		name: "o4-mini",
		provider: "OpenAI",
		description: "Reasoning-focused o4 mini with vision and tool use.",
		access: "byok",
		capabilities: ["text", "tools", "images", "reasoning"],
		contextWindow: 200_000,
		maxOutputTokens: 100_000,
		costPer1MTokens: { input: 1.1, output: 4.4 },
	},
	{
		id: "openai:o3",
		name: "o3",
		provider: "OpenAI",
		description: "Advanced o3 reasoning model with multimodal tooling.",
		access: "byok",
		capabilities: ["text", "tools", "images", "reasoning"],
		contextWindow: 200_000,
		maxOutputTokens: 100_000,
		costPer1MTokens: { input: 2, output: 8 },
	},
	{
		id: "openai:o3-pro",
		name: "o3-pro",
		provider: "OpenAI",
		description:
			"Enterprise-grade o3 pro reasoning model with premium pricing.",
		access: "byok",
		capabilities: ["text", "tools", "images", "reasoning"],
		contextWindow: 200_000,
		maxOutputTokens: 100_000,
		costPer1MTokens: { input: 20, output: 80 },
	},
	// Premium (BYOK) Models - Google
	{
		id: "google:gemini-2.5-flash",
		name: "Gemini 2.5 Flash",
		provider: "Google",
		description: "Gemini 2.5 Flash multimodal model with reasoning support.",
		access: "byok",
		capabilities: [
			"text",
			"tools",
			"images",
			"audio",
			"video",
			"pdf",
			"reasoning",
		],
		contextWindow: 1_048_576,
		maxOutputTokens: 65_536,
		costPer1MTokens: { input: 0.3, output: 2.5 },
	},
	{
		id: "google:gemini-2.5-pro",
		name: "Gemini 2.5 Pro",
		provider: "Google",
		description: "Gemini 2.5 Pro with 1M context and full multimodal support.",
		access: "byok",
		capabilities: [
			"text",
			"tools",
			"images",
			"audio",
			"video",
			"pdf",
			"reasoning",
		],
		contextWindow: 1_048_576,
		maxOutputTokens: 65_536,
		costPer1MTokens: { input: 1.25, output: 10 },
	},
	// Premium (BYOK) Models - Anthropic
	{
		id: "anthropic:claude-opus-4-20250514",
		name: "Claude Opus 4",
		provider: "Anthropic",
		description: "Claude Opus 4 (May 2025) with full reasoning toolkit.",
		access: "byok",
		capabilities: ["text", "tools", "images", "reasoning"],
		contextWindow: 200_000,
		maxOutputTokens: 32_000,
		costPer1MTokens: { input: 15, output: 75 },
	},
	{
		id: "anthropic:claude-sonnet-4-5-20250929",
		name: "Claude Sonnet 4.5",
		provider: "Anthropic",
		description: "Claude Sonnet 4.5 (Sep 2025) balanced for depth and speed.",
		access: "byok",
		capabilities: ["text", "tools", "images", "reasoning"],
		contextWindow: 200_000,
		maxOutputTokens: 64_000,
		costPer1MTokens: { input: 3, output: 15 },
	},
	{
		id: "anthropic:claude-sonnet-4-20250514",
		name: "Claude Sonnet 4",
		provider: "Anthropic",
		description: "Claude Sonnet 4 (May 2025) multimodal thinking model.",
		access: "byok",
		capabilities: ["text", "tools", "images", "reasoning"],
		contextWindow: 200_000,
		maxOutputTokens: 64_000,
		costPer1MTokens: { input: 3, output: 15 },
	},
	{
		id: "anthropic:claude-3-7-sonnet-20250219",
		name: "Claude Sonnet 3.7",
		provider: "Anthropic",
		description: "Claude Sonnet 3.7 (Feb 2025) with expanded tool use.",
		access: "byok",
		capabilities: ["text", "tools", "images", "reasoning"],
		contextWindow: 200_000,
		maxOutputTokens: 64_000,
		costPer1MTokens: { input: 3, output: 15 },
	},
	{
		id: "anthropic:claude-3-5-haiku-20241022",
		name: "Claude Haiku 3.5",
		provider: "Anthropic",
		description: "Claude Haiku 3.5 (Oct 2024) optimized for speed.",
		access: "byok",
		capabilities: ["text", "tools", "images"],
		contextWindow: 200_000,
		maxOutputTokens: 8_192,
		costPer1MTokens: { input: 0.8, output: 4 },
	},
];

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
	const model = STATIC_MODELS.find((m) => m.id === modelId);
	return model?.name ?? modelId;
}
