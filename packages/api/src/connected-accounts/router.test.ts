import assert from "node:assert/strict";
import test from "node:test";

import type { ProductDb } from "@better-agent/db";
import { user } from "@better-agent/db/schema/auth";
import { userConnectedAccounts } from "@better-agent/db/schema/connected-accounts";
import { ORPCError, call } from "@orpc/server";
import { eq } from "drizzle-orm";

import type { Context } from "../context";
import { decryptCredential } from "../crypto";
import { createTestProductDb } from "../testing/product-db";
import { connectedAccountsRouter } from "./router";

const TEST_SECRET = "test-secret";
const OWNER = { session: { id: "session_owner" }, user: { id: "owner_user" } };
const OTHER = { session: { id: "session_other" }, user: { id: "other_user" } };

const createCallContext = (db: ProductDb, session: typeof OWNER): Context =>
	({
		db,
		env: { BETTER_AUTH_SECRET: TEST_SECRET },
		executionCtx: undefined,
		headers: new Headers(),
		session,
	}) as unknown as Context;

const seedUsers = async (db: ProductDb) => {
	await db.insert(user).values([
		{ email: "owner@example.com", id: OWNER.user.id, name: "Owner" },
		{ email: "other@example.com", id: OTHER.user.id, name: "Other" },
	]);
};

/** Replace global fetch with a stub for the duration of one test. */
const withFetch = async (impl: typeof fetch, run: () => Promise<void>) => {
	const original = globalThis.fetch;
	globalThis.fetch = impl;
	try {
		await run();
	} finally {
		globalThis.fetch = original;
	}
};

const githubUser = (login: string, status = 200): typeof fetch =>
	(() => Promise.resolve(Response.json({ login }, { status }))) as typeof fetch;

const expectCode =
	(code: string) =>
	(error: unknown): boolean =>
		error instanceof ORPCError && error.code === code;

test("connect validates the token, resolves the login, and stores it encrypted", async () => {
	const db = createTestProductDb();
	await seedUsers(db);

	await withFetch(githubUser("octocat"), async () => {
		const result = await call(
			connectedAccountsRouter.connect,
			{ token: "ghp_fineGrainedExampleToken" },
			{ context: createCallContext(db, OWNER) },
		);
		assert.equal(result.externalAccountId, "octocat");
		assert.equal(result.catalogId, "github");
		assert.equal(result.credentialType, "pat");
		// The connect response previews the credential but never echoes it raw.
		assert.notEqual(result.redactedCredential, "ghp_fineGrainedExampleToken");
	});

	const [row] = await db
		.select()
		.from(userConnectedAccounts)
		.where(eq(userConnectedAccounts.userId, OWNER.user.id));
	assert.equal(row?.externalAccountId, "octocat");
	assert.notEqual(row?.encryptedCredential, "ghp_fineGrainedExampleToken");
	assert.equal(
		await decryptCredential(row?.encryptedCredential ?? "", TEST_SECRET),
		"ghp_fineGrainedExampleToken",
	);
});

test("an invalid token is rejected and nothing is stored", async () => {
	const db = createTestProductDb();
	await seedUsers(db);

	await withFetch(githubUser("", 401), async () => {
		await assert.rejects(
			call(
				connectedAccountsRouter.connect,
				{ token: "ghp_expiredOrRevoked" },
				{ context: createCallContext(db, OWNER) },
			),
			expectCode("BAD_REQUEST"),
		);
	});

	const rows = await db
		.select()
		.from(userConnectedAccounts)
		.where(eq(userConnectedAccounts.userId, OWNER.user.id));
	assert.equal(rows.length, 0);
});

test("a network failure at connect surfaces honestly and stores nothing", async () => {
	const db = createTestProductDb();
	await seedUsers(db);

	const failingFetch = (() => Promise.reject(new Error("network down"))) as typeof fetch;
	await withFetch(failingFetch, async () => {
		await assert.rejects(
			call(
				connectedAccountsRouter.connect,
				{ token: "ghp_anything" },
				{ context: createCallContext(db, OWNER) },
			),
			expectCode("BAD_REQUEST"),
		);
	});

	const rows = await db
		.select()
		.from(userConnectedAccounts)
		.where(eq(userConnectedAccounts.userId, OWNER.user.id));
	assert.equal(rows.length, 0);
});

test("list returns the identity redacted and never the raw token", async () => {
	const db = createTestProductDb();
	await seedUsers(db);

	await withFetch(githubUser("octocat"), async () => {
		await call(
			connectedAccountsRouter.connect,
			{ token: "ghp_fineGrainedExampleToken" },
			{ context: createCallContext(db, OWNER) },
		);
	});

	const accounts = await call(connectedAccountsRouter.list, undefined, {
		context: createCallContext(db, OWNER),
	});
	assert.equal(accounts.length, 1);
	assert.equal(accounts[0]?.externalAccountId, "octocat");
	assert.equal(accounts[0]?.redactedCredential, "••••");
	assert.equal(Object.values(accounts[0] ?? {}).includes("ghp_fineGrainedExampleToken"), false);
});

test("reconnecting keeps one account per provider and refreshes the credential", async () => {
	const db = createTestProductDb();
	await seedUsers(db);

	await withFetch(githubUser("octocat"), async () => {
		await call(
			connectedAccountsRouter.connect,
			{ token: "ghp_firstToken" },
			{ context: createCallContext(db, OWNER) },
		);
	});
	await withFetch(githubUser("octocat-renamed"), async () => {
		await call(
			connectedAccountsRouter.connect,
			{ token: "ghp_secondToken" },
			{ context: createCallContext(db, OWNER) },
		);
	});

	const rows = await db
		.select()
		.from(userConnectedAccounts)
		.where(eq(userConnectedAccounts.userId, OWNER.user.id));
	assert.equal(rows.length, 1);
	assert.equal(rows[0]?.externalAccountId, "octocat-renamed");
	assert.equal(
		await decryptCredential(rows[0]?.encryptedCredential ?? "", TEST_SECRET),
		"ghp_secondToken",
	);
});

test("disconnect removes the credential row", async () => {
	const db = createTestProductDb();
	await seedUsers(db);

	let accountId = "";
	await withFetch(githubUser("octocat"), async () => {
		const connected = await call(
			connectedAccountsRouter.connect,
			{ token: "ghp_fineGrainedExampleToken" },
			{ context: createCallContext(db, OWNER) },
		);
		accountId = connected.id;
	});

	const result = await call(
		connectedAccountsRouter.disconnect,
		{ accountId },
		{ context: createCallContext(db, OWNER) },
	);
	assert.equal(result.success, true);

	const rows = await db
		.select()
		.from(userConnectedAccounts)
		.where(eq(userConnectedAccounts.userId, OWNER.user.id));
	assert.equal(rows.length, 0);
});

test("a non-owner cannot see or disconnect another user's account (404-first)", async () => {
	const db = createTestProductDb();
	await seedUsers(db);

	let accountId = "";
	await withFetch(githubUser("octocat"), async () => {
		const connected = await call(
			connectedAccountsRouter.connect,
			{ token: "ghp_ownerToken" },
			{ context: createCallContext(db, OWNER) },
		);
		accountId = connected.id;
	});

	const otherList = await call(connectedAccountsRouter.list, undefined, {
		context: createCallContext(db, OTHER),
	});
	assert.equal(otherList.length, 0);

	await assert.rejects(
		call(
			connectedAccountsRouter.disconnect,
			{ accountId },
			{ context: createCallContext(db, OTHER) },
		),
		expectCode("NOT_FOUND"),
	);

	// The owner's row is untouched.
	const ownerRows = await db
		.select()
		.from(userConnectedAccounts)
		.where(eq(userConnectedAccounts.userId, OWNER.user.id));
	assert.equal(ownerRows.length, 1);
});
