import assert from "node:assert/strict";
import test from "node:test";

import { getModelDefinition, parseModelId } from "./catalog";
import {
	getReasoningProviderOptions,
	ModelResolutionError,
	resolveLanguageModel,
} from "./resolver";

test("parses native provider:model identifiers", () => {
	assert.deepEqual(parseModelId("google:gemini-2.5-flash"), {
		providerId: "google",
		providerModelId: "gemini-2.5-flash",
	});
	assert.throws(() => parseModelId("google"));
});

const requireDefinition = (modelId: string) => {
	const definition = getModelDefinition(modelId);
	assert.ok(definition, `expected a catalog definition for ${modelId}`);
	return definition;
};

test("rejects definitions that do not match the policy model id", () => {
	assert.throws(
		() =>
			resolveLanguageModel({
				modelDefinition: requireDefinition("openai:gpt-4.1"),
				policy: { credentialPermission: "granted", modelId: "openai:not-real" },
				userCredentials: { openai: "sk-test" },
			}),
		ModelResolutionError,
	);
});

test("requires explicit Thinkspace Permission before a saved credential can resolve", () => {
	assert.throws(
		() =>
			resolveLanguageModel({
				modelDefinition: requireDefinition("openai:gpt-4.1"),
				policy: { modelId: "openai:gpt-4.1" },
				userCredentials: { openai: "sk-test" },
			}),
		/Permission/u,
	);
});

test("resolves Google credentials through the native Google provider seam", () => {
	const resolved = resolveLanguageModel({
		modelDefinition: requireDefinition("google:gemini-2.5-flash"),
		policy: { credentialPermission: "granted", modelId: "google:gemini-2.5-flash" },
		userCredentials: { google: "google-test-key" },
	});

	assert.equal(resolved.providerId, "google");
	assert.equal(resolved.providerModelId, "gemini-2.5-flash");
	assert.notEqual(resolved.providerId, "openai");
});

test("maps provider-native reasoning options", () => {
	const openai = getModelDefinition("openai:o4-mini");
	const anthropic = getModelDefinition("anthropic:claude-sonnet-4-5-20250929");
	const google = getModelDefinition("google:gemini-2.5-flash");

	assert.deepEqual(openai && getReasoningProviderOptions(openai, "high"), {
		openai: { reasoningEffort: "high" },
	});
	assert.deepEqual(anthropic && getReasoningProviderOptions(anthropic, "low"), {
		anthropic: { thinking: { budgetTokens: 10_000, type: "enabled" } },
	});
	assert.deepEqual(google && getReasoningProviderOptions(google, "medium"), {
		google: { thinkingConfig: { includeThoughts: true, thinkingBudget: 8192 } },
	});
});
