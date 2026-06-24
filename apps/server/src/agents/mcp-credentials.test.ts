import assert from "node:assert/strict";
import test from "node:test";

import type { CloudflareEnv } from "@better-agent/env/types";

import { credentialedBuiltInMcpServerIds, resolveBuiltInMcpHeaders } from "./mcp-credentials";

const envWith = (overrides: Partial<CloudflareEnv>): CloudflareEnv =>
	({
		BETTER_AUTH_SECRET: "test-secret",
		BETTER_AUTH_URL: "https://example.test",
		CORS_ORIGIN: "https://example.test",
		...overrides,
	}) as CloudflareEnv;

test("a built-in authed server is credentialed only when its product key is configured", () => {
	assert.deepEqual([...credentialedBuiltInMcpServerIds(envWith({}))], []);
	assert.deepEqual(
		[...credentialedBuiltInMcpServerIds(envWith({ CONTEXT7_API_KEY: "ctx7-key" }))],
		["context7"],
	);
});

test("an empty product key string leaves the built-in server uncredentialed (fail closed)", () => {
	assert.deepEqual([...credentialedBuiltInMcpServerIds(envWith({ CONTEXT7_API_KEY: "" }))], []);
});

test("built-in auth headers resolve to the declared header only when the key is set", () => {
	assert.deepEqual(resolveBuiltInMcpHeaders("context7", envWith({ CONTEXT7_API_KEY: "ctx7-key" })), {
		CONTEXT7_API_KEY: "ctx7-key",
	});
	assert.equal(resolveBuiltInMcpHeaders("context7", envWith({})), null);
});

test("a server that is not a known built-in authed server resolves to no headers", () => {
	assert.equal(
		resolveBuiltInMcpHeaders("cloudflare-docs", envWith({ CONTEXT7_API_KEY: "ctx7-key" })),
		null,
	);
	assert.equal(
		resolveBuiltInMcpHeaders("mcp_connection_registered", envWith({ CONTEXT7_API_KEY: "x" })),
		null,
	);
});
