import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { getModelCatalog } from "./catalog";
import { createMemoryModelCatalog, ModelCatalogError } from "./model-catalog";
import type { ModelCatalog } from "./model-catalog";
import {
	createModelsDevModelCatalog,
	MODEL_CATALOG_CACHE_KEY,
	MODEL_CATALOG_CACHE_TTL_SECONDS,
} from "./models-dev";
import type { ModelCatalogCache } from "./models-dev";

const FIXTURE_TIME = Date.parse("2026-06-10T12:00:00Z");

const FIXTURE_PATH = path.join(import.meta.dirname, "fixtures/models-dev-api.json");

const loadRecordedPayload = async (): Promise<unknown> =>
	JSON.parse(await readFile(FIXTURE_PATH, "utf-8"));

interface MemoryCache extends ModelCatalogCache {
	puts: { expirationTtl?: number; key: string; value: string }[];
}

const createMemoryCache = (): MemoryCache => {
	const store = new Map<string, string>();
	const puts: MemoryCache["puts"] = [];

	return {
		get: (key) => Promise.resolve(store.get(key) ?? null),
		put: (key, value, options) => {
			store.set(key, value);
			puts.push({ expirationTtl: options?.expirationTtl, key, value });
			return Promise.resolve();
		},
		puts,
	};
};

const failingCatalog: ModelCatalog = {
	getModel: () => Promise.reject(new Error("fallback unavailable")),
	listModels: () => Promise.reject(new Error("fallback unavailable")),
	sourceId: "static_reviewed",
};

const createRecordedCatalog = async ({
	cache,
	fallbackCatalog,
}: { cache?: ModelCatalogCache; fallbackCatalog?: ModelCatalog } = {}) => {
	const payload = await loadRecordedPayload();
	let fetchCount = 0;

	const catalog = createModelsDevModelCatalog({
		cache,
		fallbackCatalog,
		fetchCatalogPayload: () => {
			fetchCount += 1;
			return Promise.resolve(payload);
		},
		now: () => FIXTURE_TIME,
	});

	return { catalog, fetchCount: () => fetchCount };
};

test("maps the recorded models.dev payload into catalog entries", async () => {
	const { catalog } = await createRecordedCatalog();
	const entries = await catalog.listModels();

	const flashLite = entries.find((entry) => entry.id === "google:gemini-2.5-flash-lite");
	assert.ok(flashLite);
	assert.equal(flashLite.name, "Gemini 2.5 Flash-Lite");
	assert.equal(flashLite.providerId, "google");
	assert.equal(flashLite.providerName, "Google");
	assert.equal(flashLite.reasoning, "google_thinking_config");
	assert.equal(flashLite.contextWindow, 1_048_576);
	assert.equal(flashLite.maxOutputTokens, 65_536);
	assert.deepEqual(flashLite.costPer1MTokens, { input: 0.1, output: 0.4 });
	assert.deepEqual(flashLite.capabilities, [
		"text",
		"tools",
		"images",
		"audio",
		"video",
		"pdf",
		"reasoning",
	]);

	const o4Mini = entries.find((entry) => entry.id === "openai:o4-mini");
	assert.equal(o4Mini?.reasoning, "openai_reasoning_effort");

	const sonnet = entries.find((entry) => entry.id === "anthropic:claude-sonnet-4-5-20250929");
	assert.equal(sonnet?.reasoning, "anthropic_thinking");

	const gpt41 = entries.find((entry) => entry.id === "openai:gpt-4.1");
	assert.equal(gpt41?.reasoning, "none");
});

test("drops unsupported providers and deprecated models", async () => {
	const { catalog } = await createRecordedCatalog();
	const entries = await catalog.listModels();
	const ids = entries.map((entry) => entry.id);

	assert.ok(ids.every((id) => !id.startsWith("mistral:")));
	assert.ok(!ids.includes("anthropic:claude-3-opus-20240229"));
	assert.ok(!ids.includes("google:gemini-2.0-flash"));
	assert.deepEqual(ids, [...ids].toSorted());
});

test("drops alpha models", async () => {
	const catalog = createModelsDevModelCatalog({
		fetchCatalogPayload: () =>
			Promise.resolve({
				openai: {
					id: "openai",
					models: {
						"gpt-alpha": {
							id: "gpt-alpha",
							limit: { context: 1000, output: 100 },
							name: "GPT Alpha",
							reasoning: false,
							status: "alpha",
							tool_call: true,
						},
						"gpt-stable": {
							id: "gpt-stable",
							limit: { context: 1000, output: 100 },
							name: "GPT Stable",
							reasoning: false,
							tool_call: true,
						},
					},
					name: "OpenAI",
				},
			}),
		now: () => FIXTURE_TIME,
	});

	const entries = await catalog.listModels();
	assert.deepEqual(
		entries.map((entry) => entry.id),
		["openai:gpt-stable"],
	);
});

test("serves from the KV cache within the TTL window without refetching", async () => {
	const cache = createMemoryCache();
	const { catalog, fetchCount } = await createRecordedCatalog({ cache });

	const first = await catalog.listModels();
	const second = await catalog.listModels();
	const model = await catalog.getModel("google:gemini-2.5-flash-lite");

	assert.equal(fetchCount(), 1);
	assert.deepEqual(second, first);
	assert.ok(model);
	assert.equal(cache.puts.length, 1);
	assert.equal(cache.puts[0]?.key, MODEL_CATALOG_CACHE_KEY);
	assert.equal(cache.puts[0]?.expirationTtl, MODEL_CATALOG_CACHE_TTL_SECONDS);
});

test("a second adapter instance reads the shared KV cache instead of fetching", async () => {
	const cache = createMemoryCache();
	const { catalog, fetchCount } = await createRecordedCatalog({ cache });
	await catalog.listModels();

	const second = createModelsDevModelCatalog({
		cache,
		fetchCatalogPayload: () => Promise.reject(new Error("must not fetch within TTL")),
		now: () => FIXTURE_TIME,
	});

	const entries = await second.listModels();
	assert.equal(fetchCount(), 1);
	assert.ok(entries.length > 0);
	assert.equal(second.sourceId, "models_dev");
});

test("falls back to the reviewed static catalog when the fetch fails", async () => {
	const cache = createMemoryCache();
	const catalog = createModelsDevModelCatalog({
		cache,
		fetchCatalogPayload: () => Promise.reject(new Error("network down")),
		now: () => FIXTURE_TIME,
	});

	const entries = await catalog.listModels();
	assert.deepEqual(entries, getModelCatalog());
	assert.equal(cache.puts.length, 0);
});

test("falls back to the reviewed static catalog when the payload does not validate", async () => {
	const catalog = createModelsDevModelCatalog({
		fetchCatalogPayload: () => Promise.resolve({ openai: "not-a-provider" }),
		now: () => FIXTURE_TIME,
	});

	const entries = await catalog.listModels();
	assert.deepEqual(entries, getModelCatalog());
});

test("surfaces a typed ModelCatalogError only when both sources are unavailable", async () => {
	const catalog = createModelsDevModelCatalog({
		fallbackCatalog: failingCatalog,
		fetchCatalogPayload: () => Promise.reject(new Error("network down")),
		now: () => FIXTURE_TIME,
	});

	await assert.rejects(catalog.listModels(), (error: unknown) => {
		assert.ok(error instanceof ModelCatalogError);
		assert.equal(error.kind, "catalog_unavailable");
		return true;
	});
});

test("getModel resolves known ids and returns null for unknown ids", async () => {
	const { catalog } = await createRecordedCatalog();

	const known = await catalog.getModel("openai:gpt-4o-mini");
	assert.equal(known?.name, "GPT-4o mini");

	const unknown = await catalog.getModel("openai:not-real");
	assert.equal(unknown, null);
});

test("memory catalog adapter stays aligned with the entry contract", async () => {
	const { catalog } = await createRecordedCatalog();
	const memory = createMemoryModelCatalog(await catalog.listModels());

	const entry = await memory.getModel("anthropic:claude-sonnet-4-5-20250929");
	assert.equal(entry?.providerName, "Anthropic");
});
