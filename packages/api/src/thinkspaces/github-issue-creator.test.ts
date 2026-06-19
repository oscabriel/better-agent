import assert from "node:assert/strict";
import test from "node:test";

import { user } from "@better-agent/db/schema/auth";
import { userConnectedAccounts } from "@better-agent/db/schema/connected-accounts";
import type { ProductDb } from "@better-agent/db";

import { GitHubIssueCreationError } from "../connected-accounts/github-issues";
import { encryptCredential } from "../crypto";
import { createTestProductDb } from "../testing/product-db";
import { createThinkspaceGitHubIssueCreator } from "./github-issue-creator";

const SECRET = "test-secret";
const OWNER_ID = "owner_user";

const withFetch = async (impl: typeof fetch, run: () => Promise<void>) => {
	const original = globalThis.fetch;
	globalThis.fetch = impl;
	try {
		await run();
	} finally {
		globalThis.fetch = original;
	}
};

const seedOwner = async (db: ProductDb) => {
	await db.insert(user).values({ email: "owner@example.com", id: OWNER_ID, name: "Owner" });
};

const seedGitHubAccount = async (db: ProductDb, token: string) => {
	await db.insert(userConnectedAccounts).values({
		catalogId: "github",
		credentialType: "pat",
		encryptedCredential: await encryptCredential(token, SECRET),
		externalAccountId: "octocat",
		id: "connected_account_1",
		userId: OWNER_ID,
	});
};

test("create decrypts the owner's stored credential and creates the issue with it", async () => {
	const db = createTestProductDb();
	await seedOwner(db);
	await seedGitHubAccount(db, "ghp_live");

	let sentAuthorization: string | null = null;
	const stub = ((_url: string, init?: RequestInit) => {
		sentAuthorization = new Headers(init?.headers).get("Authorization");

		return Promise.resolve(
			Response.json(
				{ html_url: "https://github.com/octocat/x/issues/7", number: 7 },
				{ status: 201 },
			),
		);
	}) as typeof fetch;

	const creator = createThinkspaceGitHubIssueCreator({
		db,
		encryptionSecret: SECRET,
		ownerUserId: OWNER_ID,
	});

	await withFetch(stub, async () => {
		const issue = await creator.create({ body: "B", repo: "octocat/x", title: "T" });

		assert.deepEqual(issue, { number: 7, url: "https://github.com/octocat/x/issues/7" });
	});

	// The token reached GitHub decrypted — proving the store-backed decrypt-getter.
	assert.equal(sentAuthorization, "Bearer ghp_live");
});

test("a missing connected account is a needs-reconnect failure, not a silent no-op", async () => {
	const db = createTestProductDb();
	await seedOwner(db);

	let called = false;
	const stub = (() => {
		called = true;

		return Promise.resolve(Response.json({ html_url: "x", number: 1 }, { status: 201 }));
	}) as typeof fetch;

	const creator = createThinkspaceGitHubIssueCreator({
		db,
		encryptionSecret: SECRET,
		ownerUserId: OWNER_ID,
	});

	await withFetch(stub, async () => {
		await assert.rejects(
			creator.create({ body: "B", repo: "octocat/x", title: "T" }),
			(error: unknown) => error instanceof GitHubIssueCreationError && error.needsReconnect,
		);
	});

	// No credential → no GitHub call at all.
	assert.equal(called, false);
});
