export const MODEL_PROVIDER_IDS = ["openai", "anthropic", "google"] as const;
export type ModelProviderId = (typeof MODEL_PROVIDER_IDS)[number];

export type ModelCapability = "text" | "tools" | "images" | "audio" | "video" | "pdf" | "reasoning";

export interface ModelCatalogEntry {
	capabilities: ModelCapability[];
	contextWindow: number;
	costPer1MTokens?: { input: number; output: number };
	description: string;
	id: `${ModelProviderId}:${string}`;
	maxOutputTokens?: number;
	name: string;
	providerId: ModelProviderId;
	providerName: string;
	reasoning: "none" | "openai_reasoning_effort" | "anthropic_thinking" | "google_thinking_config";
	reviewedAt: string;
	source: string;
}

export const DEFAULT_MODEL_ID = "google:gemini-2.5-flash-lite";
const REVIEWED_AT = "2026-06-04";
const SOURCE =
	"Better Agent reviewed static model catalog, validated against AI SDK v6 provider factories.";

export const MODEL_CATALOG = [
	{
		capabilities: ["text", "tools", "images"],
		contextWindow: 128_000,
		costPer1MTokens: { input: 0.15, output: 0.6 },
		description: "GPT-4o mini with 128K context and vision support.",
		id: "openai:gpt-4o-mini",
		maxOutputTokens: 16_384,
		name: "GPT-4o mini",
		providerId: "openai",
		providerName: "OpenAI",
		reasoning: "none",
		reviewedAt: REVIEWED_AT,
		source: SOURCE,
	},
	{
		capabilities: ["text", "tools", "images", "audio", "video", "pdf", "reasoning"],
		contextWindow: 1_048_576,
		costPer1MTokens: { input: 0.1, output: 0.4 },
		description: "Gemini 2.5 Flash Lite with 1M context and multimodal I/O.",
		id: "google:gemini-2.5-flash-lite",
		maxOutputTokens: 65_536,
		name: "Gemini 2.5 Flash Lite",
		providerId: "google",
		providerName: "Google",
		reasoning: "google_thinking_config",
		reviewedAt: REVIEWED_AT,
		source: SOURCE,
	},
	{
		capabilities: ["text", "tools", "images"],
		contextWindow: 1_047_576,
		costPer1MTokens: { input: 2, output: 8 },
		description: "GPT-4.1 flagship with 1M context and vision support.",
		id: "openai:gpt-4.1",
		maxOutputTokens: 32_768,
		name: "GPT-4.1",
		providerId: "openai",
		providerName: "OpenAI",
		reasoning: "none",
		reviewedAt: REVIEWED_AT,
		source: SOURCE,
	},
	{
		capabilities: ["text", "tools", "images", "reasoning"],
		contextWindow: 200_000,
		costPer1MTokens: { input: 1.1, output: 4.4 },
		description: "Reasoning-focused o4 mini with vision and tool use.",
		id: "openai:o4-mini",
		maxOutputTokens: 100_000,
		name: "o4-mini",
		providerId: "openai",
		providerName: "OpenAI",
		reasoning: "openai_reasoning_effort",
		reviewedAt: REVIEWED_AT,
		source: SOURCE,
	},
	{
		capabilities: ["text", "tools", "images", "audio", "video", "pdf", "reasoning"],
		contextWindow: 1_048_576,
		costPer1MTokens: { input: 0.3, output: 2.5 },
		description: "Gemini 2.5 Flash multimodal model with native Google thinking support.",
		id: "google:gemini-2.5-flash",
		maxOutputTokens: 65_536,
		name: "Gemini 2.5 Flash",
		providerId: "google",
		providerName: "Google",
		reasoning: "google_thinking_config",
		reviewedAt: REVIEWED_AT,
		source: SOURCE,
	},
	{
		capabilities: ["text", "tools", "images", "audio", "video", "pdf", "reasoning"],
		contextWindow: 1_048_576,
		costPer1MTokens: { input: 1.25, output: 10 },
		description: "Gemini 2.5 Pro with 1M context and native Google thinking support.",
		id: "google:gemini-2.5-pro",
		maxOutputTokens: 65_536,
		name: "Gemini 2.5 Pro",
		providerId: "google",
		providerName: "Google",
		reasoning: "google_thinking_config",
		reviewedAt: REVIEWED_AT,
		source: SOURCE,
	},
	{
		capabilities: ["text", "tools", "images", "reasoning"],
		contextWindow: 200_000,
		costPer1MTokens: { input: 3, output: 15 },
		description: "Claude Sonnet 4.5 balanced for depth and speed with native thinking.",
		id: "anthropic:claude-sonnet-4-5-20250929",
		maxOutputTokens: 64_000,
		name: "Claude Sonnet 4.5",
		providerId: "anthropic",
		providerName: "Anthropic",
		reasoning: "anthropic_thinking",
		reviewedAt: REVIEWED_AT,
		source: SOURCE,
	},
] as const satisfies ModelCatalogEntry[];

export const getModelCatalog = (): ModelCatalogEntry[] => [...MODEL_CATALOG];
export const getModelDefinition = (modelId: string): ModelCatalogEntry | null =>
	MODEL_CATALOG.find((model) => model.id === modelId) ?? null;
export const parseModelId = (
	modelId: string,
): { providerId: ModelProviderId; providerModelId: string } => {
	const [providerId, ...modelParts] = modelId.split(":");
	const providerModelId = modelParts.join(":");
	if (!MODEL_PROVIDER_IDS.includes(providerId as ModelProviderId) || !providerModelId) {
		throw new Error(`Invalid model id: ${modelId}`);
	}
	return { providerId: providerId as ModelProviderId, providerModelId };
};
