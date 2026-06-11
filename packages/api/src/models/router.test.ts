import assert from "node:assert/strict";
import test from "node:test";

import type { ProductDb } from "@better-agent/db";
import { ORPCError, call } from "@orpc/server";

import type { Context } from "../context";
import { getModelCatalog } from "./catalog";
import { createMemoryModelCatalog, ModelCatalogError } from "./model-catalog";
import type { ModelCatalog } from "./model-catalog";
import { modelsRouter } from "./router";

const authenticatedSession = {
	session: { id: "session_1" },
	user: { id: "owner_user" },
};

const modelCatalog = createMemoryModelCatalog(getModelCatalog());

const unavailableCatalog: ModelCatalog = {
	getModel: () =>
		Promise.reject(new ModelCatalogError("catalog_unavailable", "both sources unavailable")),
	listModels: () =>
		Promise.reject(new ModelCatalogError("catalog_unavailable", "both sources unavailable")),
	sourceId: "models_dev",
};

const createCallContext = ({
	db,
	catalog = modelCatalog,
}: {
	catalog?: ModelCatalog;
	db: ProductDb;
}): Context =>
	({
		db,
		env: {},
		executionCtx: undefined,
		headers: new Headers(),
		modelCatalog: catalog,
		session: authenticatedSession,
	}) as unknown as Context;

const createDbForDefaults = (rows: Record<string, unknown>[] = []) => {
	const inserted: Record<string, unknown>[] = [];
	const updated: Record<string, unknown>[] = [];
	const db = {
		insert: () => ({
			values: (value: Record<string, unknown>) => {
				inserted.push(value);
				return {
					onConflictDoUpdate: ({ set }: { set: Record<string, unknown> }) => {
						updated.push(set);
						return Promise.resolve();
					},
				};
			},
		}),
		select: () => ({
			from: () => ({
				where: () => ({ limit: () => Promise.resolve(rows) }),
			}),
		}),
	};

	return { db: db as unknown as ProductDb, inserted, updated };
};

const expectCode =
	(code: string) =>
	(error: unknown): boolean =>
		error instanceof ORPCError && error.code === code;

test("reads saved model defaults with fallback values", async () => {
	const { db } = createDbForDefaults([{ defaultModel: "openai:gpt-4.1", reasoningEffort: "high" }]);
	const settings = await call(modelsRouter.getDefaults, undefined, {
		context: createCallContext({ db }),
	});

	assert.equal(settings.defaultModel, "openai:gpt-4.1");
	assert.equal(settings.reasoningEffort, "high");
});

test("updates model defaults only for catalog models", async () => {
	const { db, inserted, updated } = createDbForDefaults();
	const settings = await call(
		modelsRouter.updateDefaults,
		{ defaultModel: "google:gemini-2.5-flash-lite", reasoningEffort: "low" },
		{ context: createCallContext({ db }) },
	);

	assert.equal(settings.defaultModel, "google:gemini-2.5-flash-lite");
	assert.equal(settings.reasoningEffort, "low");
	assert.equal(inserted[0]?.userId, "owner_user");
	assert.equal(inserted[0]?.defaultModel, "google:gemini-2.5-flash-lite");
	assert.equal(inserted[0]?.reasoningEffort, "low");
	assert.equal(updated[0]?.defaultModel, "google:gemini-2.5-flash-lite");
});

test("rejects unknown default model ids", async () => {
	const { db, inserted } = createDbForDefaults();
	await assert.rejects(
		call(
			modelsRouter.updateDefaults,
			{ defaultModel: "google:not-real", reasoningEffort: "medium" },
			{ context: createCallContext({ db }) },
		),
		expectCode("BAD_REQUEST"),
	);
	assert.equal(inserted.length, 0);
});

test("default update fails safely when the model catalog is unavailable", async () => {
	const { db, inserted } = createDbForDefaults();
	await assert.rejects(
		call(
			modelsRouter.updateDefaults,
			{ defaultModel: "google:gemini-2.5-flash-lite", reasoningEffort: "medium" },
			{ context: createCallContext({ catalog: unavailableCatalog, db }) },
		),
		expectCode("SERVICE_UNAVAILABLE"),
	);
	assert.equal(inserted.length, 0);
});
