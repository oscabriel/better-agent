import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI as createGoogle } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModelV3, SharedV3ProviderOptions } from "@ai-sdk/provider";
import { defaultSettingsMiddleware, wrapLanguageModel } from "ai";

import { getModelDefinition, parseModelId } from "./catalog";
import type { ModelCatalogEntry, ModelProviderId } from "./catalog";

export type ReasoningEffort = "low" | "medium" | "high";

export interface ThinkspaceModelPolicy {
	credentialPermission?: "not_granted" | "granted";
	modelId: string;
	reasoningEffort?: ReasoningEffort;
}

export interface ResolveLanguageModelInput {
	policy: ThinkspaceModelPolicy;
	userCredentials?: Partial<Record<ModelProviderId, string | undefined>>;
}

export interface ResolvedLanguageModel {
	model: LanguageModelV3;
	modelDefinition: ModelCatalogEntry;
	providerId: ModelProviderId;
	providerModelId: string;
	reasoningProviderOptions?: SharedV3ProviderOptions;
}

const ANTHROPIC_BUDGET_MAP = { high: 64_000, low: 10_000, medium: 32_000 } as const;
const GOOGLE_THINKING_BUDGET_MAP = { high: 16_384, low: 2048, medium: 8192 } as const;

export class ModelResolutionError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "ModelResolutionError";
	}
}

export const getReasoningProviderOptions = (
	model: ModelCatalogEntry,
	effort: ReasoningEffort = "medium",
): SharedV3ProviderOptions | undefined => {
	if (model.reasoning === "openai_reasoning_effort") {
		return { openai: { reasoningEffort: effort } };
	}
	if (model.reasoning === "anthropic_thinking") {
		return {
			anthropic: { thinking: { budgetTokens: ANTHROPIC_BUDGET_MAP[effort], type: "enabled" } },
		};
	}
	if (model.reasoning === "google_thinking_config") {
		return {
			google: {
				thinkingConfig: {
					includeThoughts: true,
					thinkingBudget: GOOGLE_THINKING_BUDGET_MAP[effort],
				},
			},
		};
	}
	return undefined;
};

const withDefaultProviderOptions = (
	model: LanguageModelV3,
	providerOptions?: SharedV3ProviderOptions,
): LanguageModelV3 => {
	if (!providerOptions) {
		return model;
	}
	return wrapLanguageModel({
		middleware: defaultSettingsMiddleware({ settings: { providerOptions } }),
		model,
	});
};

export const resolveLanguageModel = ({
	policy,
	userCredentials,
}: ResolveLanguageModelInput): ResolvedLanguageModel => {
	const modelDefinition = getModelDefinition(policy.modelId);
	if (!modelDefinition) {
		throw new ModelResolutionError(`Unknown model: ${policy.modelId}`);
	}

	const { providerId, providerModelId } = parseModelId(policy.modelId);
	if (policy.credentialPermission !== "granted") {
		throw new ModelResolutionError(
			"This Thinkspace has not been granted Permission to use the saved provider credential.",
		);
	}

	const apiKey = userCredentials?.[providerId];
	if (!apiKey) {
		throw new ModelResolutionError(`Missing ${providerId} credential for ${policy.modelId}.`);
	}

	const providerOptions = getReasoningProviderOptions(modelDefinition, policy.reasoningEffort);
	let baseModel: LanguageModelV3;
	if (providerId === "openai") {
		baseModel = createOpenAI({ apiKey })(providerModelId);
	} else if (providerId === "anthropic") {
		baseModel = createAnthropic({ apiKey })(providerModelId);
	} else {
		baseModel = createGoogle({ apiKey })(providerModelId);
	}
	const model = withDefaultProviderOptions(baseModel, providerOptions);

	return {
		model,
		modelDefinition,
		providerId,
		providerModelId,
		reasoningProviderOptions: providerOptions,
	};
};
