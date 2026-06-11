import assert from "node:assert/strict";
import test from "node:test";

import type { ProductDb } from "@better-agent/db";

import { getModelCatalog } from "./catalog";
import type { ModelCatalogEntry } from "./catalog";
import { createMemoryModelCatalog, ModelCatalogError } from "./model-catalog";
import type { ModelCatalog } from "./model-catalog";
import {
	checkThinkspaceModelReadiness,
	getOwnedThinkspaceModelReadiness,
	resolveOwnedThinkspaceTurnModel,
	ThinkspaceTurnModelUnavailableError,
} from "./readiness";

const db = {} as ProductDb;

const createEnv = () => ({
	API_ENCRYPTION_KEY: undefined,
	BETTER_AUTH_SECRET: "test-secret",
});

/**
 * Memory ModelCatalog over the reviewed static entries, plus a models.dev-only
 * entry that the static catalog does not know about. No live network in tests.
 */
const modelsDevOnlyEntry: ModelCatalogEntry = {
	capabilities: ["text", "tools", "reasoning"],
	contextWindow: 1_048_576,
	description: "Gemini catalog-only test model from the models.dev catalog.",
	id: "google:gemini-catalog-only",
	maxOutputTokens: 65_536,
	name: "Gemini Catalog Only",
	providerId: "google",
	providerName: "Google",
	reasoning: "google_thinking_config",
	reviewedAt: "2026-06-10",
	source: "models.dev API catalog (https://models.dev/api.json).",
};

const modelCatalog = createMemoryModelCatalog([...getModelCatalog(), modelsDevOnlyEntry]);

const unavailableCatalog: ModelCatalog = {
	getModel: () =>
		Promise.reject(new ModelCatalogError("catalog_unavailable", "both sources unavailable")),
	listModels: () =>
		Promise.reject(new ModelCatalogError("catalog_unavailable", "both sources unavailable")),
	sourceId: "models_dev",
};

const createThinkspace = () => ({
	id: "thinkspace_model_readiness",
});

const activeRevision = (modelId = "google:gemini-2.5-flash-lite") =>
	({
		id: "profile_revision_active",
		identity: { displayName: "Release Monitor", instructions: "Watch releases." },
		modelBehavior: { modelId, reasoningLevel: "medium" },
		version: 1,
	}) as never;

const grantedCredentialPermission =
	(providerId: string) => (_db: ProductDb, input: { providerId: string; thinkspaceId: string }) =>
		Promise.resolve(input.providerId === providerId);

test("reports ready for the default model once the credential Permission is granted", async () => {
	const readiness = await checkThinkspaceModelReadiness({
		db,
		env: createEnv(),
		getUserCredential: (_db, input) => {
			assert.equal(input.providerId, "google");
			assert.equal(input.userId, "user_123");
			return Promise.resolve("google-test-key");
		},
		hasModelProviderCredentialPermission: grantedCredentialPermission("google"),
		modelCatalog,
		settings: null,
		thinkspace: createThinkspace(),
		userId: "user_123",
	});

	assert.equal(readiness.status, "ready");
	assert.equal(readiness.modelId, "google:gemini-2.5-flash-lite");
});

test("fails closed for unknown configured model ids", async () => {
	const readiness = await checkThinkspaceModelReadiness({
		db,
		env: createEnv(),
		modelCatalog,
		settings: { defaultModel: "openai:not-real", reasoningEffort: "medium" },
		thinkspace: createThinkspace(),
		userId: "user_123",
	});

	assert.equal(readiness.status, "not_ready");
	assert.equal(readiness.reason, "unknown_model");
	assert.equal(readiness.message, "The selected model is not in the supported model catalog.");
});

test("fails closed when the user has no saved provider credential", async () => {
	const readiness = await checkThinkspaceModelReadiness({
		db,
		env: createEnv(),
		getUserCredential: () => Promise.resolve(null),
		hasModelProviderCredentialPermission: grantedCredentialPermission("google"),
		modelCatalog,
		settings: null,
		thinkspace: createThinkspace(),
		userId: "user_123",
	});

	assert.equal(readiness.status, "not_ready");
	assert.equal(readiness.reason, "missing_user_credential");
	assert.equal(readiness.message, "The saved provider credential for this model is not available.");
});

test("requires Thinkspace Permission before resolving any saved credential", async () => {
	let credentialLoadCount = 0;
	const readiness = await checkThinkspaceModelReadiness({
		db,
		env: createEnv(),
		getUserCredential: () => {
			credentialLoadCount += 1;
			return Promise.resolve("sk-test");
		},
		hasModelProviderCredentialPermission: () => Promise.resolve(false),
		modelCatalog,
		settings: { defaultModel: "openai:gpt-4.1", reasoningEffort: "medium" },
		thinkspace: createThinkspace(),
		userId: "user_123",
	});

	assert.equal(readiness.status, "not_ready");
	assert.equal(readiness.reason, "permission_required");
	assert.equal(credentialLoadCount, 0);
});

test("reports ready only after the Thinkspace credential Permission is granted", async () => {
	const readiness = await checkThinkspaceModelReadiness({
		db,
		env: createEnv(),
		getUserCredential: (_db, input) => {
			assert.equal(input.providerId, "openai");
			assert.equal(input.userId, "user_123");
			return Promise.resolve("sk-test");
		},
		hasModelProviderCredentialPermission: grantedCredentialPermission("openai"),
		modelCatalog,
		settings: { defaultModel: "openai:gpt-4.1", reasoningEffort: "medium" },
		thinkspace: createThinkspace(),
		userId: "user_123",
	});

	assert.equal(readiness.status, "ready");
	assert.equal(readiness.modelId, "openai:gpt-4.1");
});

test("owner-gated model readiness reports readiness for owned Thinkspaces", async () => {
	const readiness = await getOwnedThinkspaceModelReadiness({
		db,
		env: createEnv(),
		getActiveRevision: () => Promise.resolve(activeRevision()),
		getThinkspaceByOwner: (_db, input) => {
			assert.equal(input.ownerUserId, "owner_user");
			assert.equal(input.thinkspaceId, "thinkspace_owned");
			return Promise.resolve(createThinkspace());
		},
		getUserCredential: () => Promise.resolve("google-test-key"),
		hasModelProviderCredentialPermission: grantedCredentialPermission("google"),
		modelCatalog,
		ownerUserId: "owner_user",
		thinkspaceId: "thinkspace_owned",
	});

	assert.equal(readiness?.status, "ready");
	assert.equal(readiness?.modelId, "google:gemini-2.5-flash-lite");
});

test("resolves a usable turn model for ready owned Thinkspaces", async () => {
	const resolved = await resolveOwnedThinkspaceTurnModel({
		db,
		env: createEnv(),
		getActiveRevision: () => Promise.resolve(activeRevision()),
		getThinkspaceByOwner: () => Promise.resolve(createThinkspace()),
		getUserCredential: () => Promise.resolve("google-test-key"),
		hasModelProviderCredentialPermission: grantedCredentialPermission("google"),
		modelCatalog,
		ownerUserId: "owner_user",
		thinkspaceId: "thinkspace_owned",
	});

	assert.equal(resolved?.readiness.status, "ready");
	assert.equal(resolved?.readiness.modelId, "google:gemini-2.5-flash-lite");
	assert.ok(resolved?.model);
});

test("turn model resolution fails closed with a product-safe error when not ready", async () => {
	await assert.rejects(
		resolveOwnedThinkspaceTurnModel({
			db,
			env: createEnv(),
			getActiveRevision: () => Promise.resolve(activeRevision()),
			getThinkspaceByOwner: () => Promise.resolve(createThinkspace()),
			getUserCredential: () => Promise.resolve(null),
			hasModelProviderCredentialPermission: grantedCredentialPermission("google"),
			modelCatalog,
			ownerUserId: "owner_user",
			thinkspaceId: "thinkspace_owned",
		}),
		(error: unknown) => {
			assert.ok(error instanceof ThinkspaceTurnModelUnavailableError);
			assert.equal(error.readiness.reason, "missing_user_credential");
			assert.equal(error.message, "The saved provider credential for this model is not available.");
			return true;
		},
	);
});

test("owner-gated model readiness is not ready without an active Agent Profile revision", async () => {
	const readiness = await getOwnedThinkspaceModelReadiness({
		db,
		env: createEnv(),
		getActiveRevision: () => Promise.resolve(null),
		getThinkspaceByOwner: () => Promise.resolve(createThinkspace()),
		modelCatalog,
		ownerUserId: "owner_user",
		thinkspaceId: "thinkspace_owned",
	});

	assert.equal(readiness?.status, "not_ready");
	assert.equal(readiness?.reason, "no_active_agent_profile_revision");
});

test("turn model resolution returns null for non-owned Thinkspaces", async () => {
	const resolved = await resolveOwnedThinkspaceTurnModel({
		db,
		env: createEnv(),
		getActiveRevision: () => Promise.resolve(activeRevision()),
		getThinkspaceByOwner: () => Promise.resolve(null),
		modelCatalog,
		ownerUserId: "other_user",
		thinkspaceId: "thinkspace_owned",
	});

	assert.equal(resolved, null);
});

test("owner-gated model readiness returns null for non-owned Thinkspaces", async () => {
	const readiness = await getOwnedThinkspaceModelReadiness({
		db,
		env: createEnv(),
		getActiveRevision: () => Promise.resolve(activeRevision()),
		getThinkspaceByOwner: (_db, input) => {
			assert.equal(input.ownerUserId, "other_user");
			return Promise.resolve(null);
		},
		modelCatalog,
		ownerUserId: "other_user",
		thinkspaceId: "thinkspace_owned",
	});

	assert.equal(readiness, null);
});

test("reports ready for a models.dev-only model from a credentialed, Permission-granted provider", async () => {
	const readiness = await checkThinkspaceModelReadiness({
		db,
		env: createEnv(),
		getUserCredential: () => Promise.resolve("google-test-key"),
		hasModelProviderCredentialPermission: grantedCredentialPermission("google"),
		modelCatalog,
		settings: { defaultModel: "google:gemini-catalog-only", reasoningEffort: "medium" },
		thinkspace: createThinkspace(),
		userId: "user_123",
	});

	assert.equal(readiness.status, "ready");
	assert.equal(readiness.modelId, "google:gemini-catalog-only");
	assert.equal(readiness.modelName, "Gemini Catalog Only");
});

test("resolves a usable turn model for a models.dev-only model id", async () => {
	const resolved = await resolveOwnedThinkspaceTurnModel({
		db,
		env: createEnv(),
		getActiveRevision: () => Promise.resolve(activeRevision("google:gemini-catalog-only")),
		getThinkspaceByOwner: () => Promise.resolve(createThinkspace()),
		getUserCredential: () => Promise.resolve("google-test-key"),
		hasModelProviderCredentialPermission: grantedCredentialPermission("google"),
		modelCatalog,
		ownerUserId: "owner_user",
		thinkspaceId: "thinkspace_owned",
	});

	assert.equal(resolved?.readiness.status, "ready");
	assert.equal(resolved?.readiness.modelId, "google:gemini-catalog-only");
	assert.ok(resolved?.model);
});

test("catalog unavailability fails closed with a product-safe readiness", async () => {
	const readiness = await checkThinkspaceModelReadiness({
		db,
		env: createEnv(),
		getUserCredential: () => Promise.resolve("google-test-key"),
		modelCatalog: unavailableCatalog,
		settings: null,
		thinkspace: createThinkspace(),
		userId: "user_123",
	});

	assert.equal(readiness.status, "not_ready");
	assert.equal(readiness.reason, "resolution_failed");
	assert.doesNotMatch(readiness.message, /unavailable catalog|fetch|sources/iu);
	assert.match(readiness.message, /model catalog is temporarily unavailable/u);
});
