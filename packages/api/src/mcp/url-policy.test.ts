import assert from "node:assert/strict";
import test from "node:test";

import { listBuiltInMcpServers } from "./catalog";
import { createCanonicalMcpToolIdentity } from "./tool-identity";
import { assertSafeMcpServerUrl, McpUrlPolicyError } from "./url-policy";

test("built-in MCP catalog entries do not expose tools to Thinkspaces by default", () => {
	assert.ok(listBuiltInMcpServers().some((server) => server.id === "context7"));
	assert.equal(
		listBuiltInMcpServers().every((server) => server.enabledByDefaultForThinkspaces === false),
		true,
	);
});

test("MCP URL policy requires HTTPS and blocks private targets", () => {
	assert.equal(
		assertSafeMcpServerUrl("https://docs.mcp.cloudflare.com/mcp").hostname,
		"docs.mcp.cloudflare.com",
	);
	assert.throws(() => assertSafeMcpServerUrl("http://example.com/mcp"), McpUrlPolicyError);
	assert.throws(() => assertSafeMcpServerUrl("https://127.0.0.1/mcp"), McpUrlPolicyError);
	assert.throws(
		() => assertSafeMcpServerUrl("https://169.254.169.254/latest/meta-data"),
		McpUrlPolicyError,
	);
	assert.throws(
		() => assertSafeMcpServerUrl("https://user:pass@example.com/mcp"),
		McpUrlPolicyError,
	);
});

test("tool identity keeps canonical server/tool ids separate from model aliases", () => {
	assert.deepEqual(createCanonicalMcpToolIdentity("context7", "resolve-library-id"), {
		modelAlias: "context7__resolve-library-id",
		serverId: "context7",
		toolName: "resolve-library-id",
	});
});
