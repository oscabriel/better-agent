import assert from "node:assert/strict";
import test from "node:test";

import { createGitHubIssue, GitHubIssueCreationError, isValidGitHubRepo } from "./github-issues";

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

const isCreationError =
	(predicate: (error: GitHubIssueCreationError) => boolean) =>
	(error: unknown): boolean =>
		error instanceof GitHubIssueCreationError && predicate(error);

test("isValidGitHubRepo accepts owner/name and rejects malformed input", () => {
	assert.equal(isValidGitHubRepo("octocat/hello-world"), true);
	assert.equal(isValidGitHubRepo("octo-cat/hello.world_2"), true);

	// No slash.
	assert.equal(isValidGitHubRepo("octocat"), false);
	// Two slashes.
	assert.equal(isValidGitHubRepo("octocat/hello/world"), false);
	// Path traversal.
	assert.equal(isValidGitHubRepo("octocat/../secrets"), false);
	// Space.
	assert.equal(isValidGitHubRepo("octocat/ hello"), false);
	// Empty owner.
	assert.equal(isValidGitHubRepo("/hello-world"), false);
	assert.equal(isValidGitHubRepo(""), false);
});

test("createGitHubIssue posts to the repo issues endpoint and returns the real number and url", async () => {
	let captured: { init?: RequestInit; url: string } | undefined;
	const stub = ((url: string, init?: RequestInit) => {
		captured = { init, url };

		return Promise.resolve(
			Response.json(
				{ html_url: "https://github.com/octocat/hello-world/issues/42", number: 42 },
				{ status: 201 },
			),
		);
	}) as typeof fetch;

	await withFetch(stub, async () => {
		const issue = await createGitHubIssue("ghp_live", {
			body: "Steps to reproduce.",
			repo: "octocat/hello-world",
			title: "Something broke",
		});

		assert.deepEqual(issue, {
			number: 42,
			url: "https://github.com/octocat/hello-world/issues/42",
		});
	});

	assert.match(captured?.url ?? "", /\/repos\/octocat\/hello-world\/issues$/u);
	assert.equal(captured?.init?.method, "POST");
});

test("a malformed repo aborts before any GitHub call", async () => {
	let called = false;
	const stub = (() => {
		called = true;

		return Promise.resolve(Response.json({ html_url: "x", number: 1 }, { status: 201 }));
	}) as typeof fetch;

	await withFetch(stub, async () => {
		await assert.rejects(
			createGitHubIssue("ghp_live", { body: "B", repo: "not-a-repo", title: "T" }),
			isCreationError((error) => !error.needsReconnect),
		);
	});

	assert.equal(called, false);
});

test("a 401 yields a needs-reconnect error and never claims success", async () => {
	const stub = (() =>
		Promise.resolve(
			Response.json({ message: "Bad credentials" }, { status: 401 }),
		)) as typeof fetch;

	await withFetch(stub, async () => {
		await assert.rejects(
			createGitHubIssue("ghp_dead", { body: "B", repo: "octocat/hello-world", title: "T" }),
			isCreationError((error) => error.needsReconnect),
		);
	});
});

test("a non-ok API error is a structured failure without reconnect and without fabricated success", async () => {
	const stub = (() =>
		Promise.resolve(Response.json({ message: "Not Found" }, { status: 404 }))) as typeof fetch;

	await withFetch(stub, async () => {
		await assert.rejects(
			createGitHubIssue("ghp_live", { body: "B", repo: "octocat/ghost-repo", title: "T" }),
			isCreationError((error) => !error.needsReconnect),
		);
	});
});

test("a network failure surfaces honestly", async () => {
	const stub = (() => Promise.reject(new Error("network down"))) as typeof fetch;

	await withFetch(stub, async () => {
		await assert.rejects(
			createGitHubIssue("ghp_live", { body: "B", repo: "octocat/hello-world", title: "T" }),
			isCreationError(() => true),
		);
	});
});

test("a 2xx response without issue details is not treated as success", async () => {
	const stub = (() => Promise.resolve(Response.json({}, { status: 201 }))) as typeof fetch;

	await withFetch(stub, async () => {
		await assert.rejects(
			createGitHubIssue("ghp_live", { body: "B", repo: "octocat/hello-world", title: "T" }),
			isCreationError(() => true),
		);
	});
});
