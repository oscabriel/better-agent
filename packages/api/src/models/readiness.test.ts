import assert from "node:assert/strict";
import test from "node:test";

import type { ProductDb } from "@better-agent/db";

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

const createThinkspace = (requestedPermissions = "[]") => ({
	id: "thinkspace_model_readiness",
	requestedPermissions,
});

const grantedCredentialPermission = (providerId: string): string =>
	JSON.stringify([
		{
			granted: true,
			providerId,
			type: "model_provider_credential_permission",
		},
	]);

test("reports ready for the default model once the credential Permission is granted", async () => {
	const readiness = await checkThinkspaceModelReadiness({
		db,
		env: createEnv(),
		getUserCredential: (_db, input) => {
			assert.equal(input.providerId, "google");
			assert.equal(input.userId, "user_123");
			return Promise.resolve("google-test-key");
		},
		settings: null,
		thinkspace: createThinkspace(grantedCredentialPermission("google")),
		userId: "user_123",
	});

	assert.equal(readiness.status, "ready");
	assert.equal(readiness.modelId, "google:gemini-2.5-flash-lite");
});

test("fails closed for unknown configured model ids", async () => {
	const readiness = await checkThinkspaceModelReadiness({
		db,
		env: createEnv(),
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
		settings: null,
		thinkspace: createThinkspace(grantedCredentialPermission("google")),
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
		settings: { defaultModel: "openai:gpt-4.1", reasoningEffort: "medium" },
		thinkspace: createThinkspace(grantedCredentialPermission("openai")),
		userId: "user_123",
	});

	assert.equal(readiness.status, "ready");
	assert.equal(readiness.modelId, "openai:gpt-4.1");
});

test("owner-gated model readiness reports readiness for owned Thinkspaces", async () => {
	const readiness = await getOwnedThinkspaceModelReadiness({
		db,
		env: createEnv(),
		getThinkspaceByOwner: (_db, input) => {
			assert.equal(input.ownerUserId, "owner_user");
			assert.equal(input.thinkspaceId, "thinkspace_owned");
			return Promise.resolve(createThinkspace(grantedCredentialPermission("google")));
		},
		getUserCredential: () => Promise.resolve("google-test-key"),
		getUserSettings: () => Promise.resolve(null),
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
		getThinkspaceByOwner: () =>
			Promise.resolve(createThinkspace(grantedCredentialPermission("google"))),
		getUserCredential: () => Promise.resolve("google-test-key"),
		getUserSettings: () => Promise.resolve(null),
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
			getThinkspaceByOwner: () =>
				Promise.resolve(createThinkspace(grantedCredentialPermission("google"))),
			getUserCredential: () => Promise.resolve(null),
			getUserSettings: () => Promise.resolve(null),
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

test("turn model resolution returns null for non-owned Thinkspaces", async () => {
	const resolved = await resolveOwnedThinkspaceTurnModel({
		db,
		env: createEnv(),
		getThinkspaceByOwner: () => Promise.resolve(null),
		getUserSettings: () => Promise.resolve(null),
		ownerUserId: "other_user",
		thinkspaceId: "thinkspace_owned",
	});

	assert.equal(resolved, null);
});

test("owner-gated model readiness returns null for non-owned Thinkspaces", async () => {
	const readiness = await getOwnedThinkspaceModelReadiness({
		db,
		env: createEnv(),
		getThinkspaceByOwner: (_db, input) => {
			assert.equal(input.ownerUserId, "other_user");
			return Promise.resolve(null);
		},
		getUserSettings: () => Promise.resolve(null),
		ownerUserId: "other_user",
		thinkspaceId: "thinkspace_owned",
	});

	assert.equal(readiness, null);
});
