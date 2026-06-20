import assert from "node:assert/strict";
import test from "node:test";

import type { ProductDb } from "@better-agent/db";

import { getModelCatalog } from "./catalog";
import {
	checkCuratorModelReadiness,
	CuratorModelUnavailableError,
	resolveCuratorModel,
} from "./curator";
import { createMemoryModelCatalog, ModelCatalogError } from "./model-catalog";
import type { ModelCatalog } from "./model-catalog";
import { resolveLanguageModel } from "./resolver";

const db = {} as ProductDb;

const createEnv = () => ({
	API_ENCRYPTION_KEY: undefined,
	BETTER_AUTH_SECRET: "test-secret",
});

const modelCatalog = createMemoryModelCatalog(getModelCatalog());

const unavailableCatalog: ModelCatalog = {
	getModel: () =>
		Promise.reject(new ModelCatalogError("catalog_unavailable", "both sources unavailable")),
	listModels: () =>
		Promise.reject(new ModelCatalogError("catalog_unavailable", "both sources unavailable")),
	sourceId: "models_dev",
};

const credential = (apiKey: string | null) => () => Promise.resolve(apiKey);

test("resolves the system default model ungated when no settings exist", async () => {
	const readiness = await checkCuratorModelReadiness({
		db,
		env: createEnv(),
		getUserCredential: (_db, input) => {
			// The Curator resolves the user's product credential directly; no
			// per-Thinkspace Permission is ever consulted on this path.
			assert.equal(input.providerId, "google");
			assert.equal(input.userId, "user_123");
			return Promise.resolve("google-test-key");
		},
		modelCatalog,
		settings: null,
		userId: "user_123",
	});

	assert.equal(readiness.status, "ready");
	assert.equal(readiness.modelId, "google:gemini-2.5-flash-lite");
	assert.equal(readiness.status === "ready" && readiness.source, "system_default");
});

test("the Curator model setting overrides the default model", async () => {
	const readiness = await checkCuratorModelReadiness({
		db,
		env: createEnv(),
		getUserCredential: credential("sk-test"),
		modelCatalog,
		settings: {
			curatorModel: "openai:gpt-4.1",
			defaultModel: "google:gemini-2.5-flash-lite",
			reasoningEffort: "medium",
		},
		userId: "user_123",
	});

	assert.equal(readiness.status, "ready");
	assert.equal(readiness.modelId, "openai:gpt-4.1");
	assert.equal(readiness.status === "ready" && readiness.source, "curator_model");
});

test("falls back to the default model when no Curator model is set", async () => {
	const readiness = await checkCuratorModelReadiness({
		db,
		env: createEnv(),
		getUserCredential: credential("sk-test"),
		modelCatalog,
		settings: {
			curatorModel: null,
			defaultModel: "openai:gpt-4.1",
			reasoningEffort: "high",
		},
		userId: "user_123",
	});

	assert.equal(readiness.status, "ready");
	assert.equal(readiness.modelId, "openai:gpt-4.1");
	assert.equal(readiness.status === "ready" && readiness.source, "default_model");
});

test("fails closed with a connect-first state when no credential exists", async () => {
	const readiness = await checkCuratorModelReadiness({
		db,
		env: createEnv(),
		getUserCredential: credential(null),
		modelCatalog,
		settings: null,
		userId: "user_123",
	});

	assert.equal(readiness.status, "not_ready");
	assert.equal(readiness.reason, "missing_user_credential");
	assert.match(readiness.message, /Connect a model provider credential/u);
});

test("fails closed for an unknown Curator model id", async () => {
	const readiness = await checkCuratorModelReadiness({
		db,
		env: createEnv(),
		getUserCredential: credential("sk-test"),
		modelCatalog,
		settings: { curatorModel: "openai:not-real", defaultModel: null, reasoningEffort: "medium" },
		userId: "user_123",
	});

	assert.equal(readiness.status, "not_ready");
	assert.equal(readiness.reason, "unknown_model");
});

test("catalog unavailability fails closed with a product-safe readiness", async () => {
	const readiness = await checkCuratorModelReadiness({
		db,
		env: createEnv(),
		getUserCredential: credential("sk-test"),
		modelCatalog: unavailableCatalog,
		settings: null,
		userId: "user_123",
	});

	assert.equal(readiness.status, "not_ready");
	assert.equal(readiness.reason, "resolution_failed");
	assert.doesNotMatch(readiness.message, /unavailable catalog|fetch|sources/iu);
	assert.match(readiness.message, /model catalog is temporarily unavailable/u);
});

test("resolveCuratorModel returns a usable model and threads reasoning effort", async () => {
	const resolved = await resolveCuratorModel({
		db,
		env: createEnv(),
		getUserCredential: credential("google-test-key"),
		modelCatalog,
		settings: { curatorModel: null, defaultModel: null, reasoningEffort: "high" },
		userId: "user_123",
	});

	assert.equal(resolved.providerId, "google");
	assert.equal(resolved.modelDefinition.id, "google:gemini-2.5-flash-lite");
	assert.equal(resolved.reasoningEffort, "high");
	assert.equal(resolved.readiness.status, "ready");
	assert.ok(resolved.model);
});

test("resolveCuratorModel fails closed when the Curator cannot run", async () => {
	await assert.rejects(
		resolveCuratorModel({
			db,
			env: createEnv(),
			getUserCredential: credential(null),
			modelCatalog,
			settings: null,
			userId: "user_123",
		}),
		(error: unknown) => {
			assert.ok(error instanceof CuratorModelUnavailableError);
			assert.equal(error.readiness.reason, "missing_user_credential");
			return true;
		},
	);
});

test("the Thinkspace-Agent resolver still rejects the same credential without a grant", () => {
	// The Curator path is ungated by design; the Thinkspace-Agent invariant must
	// stay intact — the same credential is refused without an explicit grant.
	const definition = getModelCatalog().find((m) => m.id === "google:gemini-2.5-flash-lite");
	assert.ok(definition);
	assert.throws(
		() =>
			resolveLanguageModel({
				modelDefinition: definition,
				policy: { modelId: "google:gemini-2.5-flash-lite" },
				userCredentials: { google: "google-test-key" },
			}),
		/Permission/u,
	);
});
