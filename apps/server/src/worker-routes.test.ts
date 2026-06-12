import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

/**
 * The worker and Durable Object modules import `cloudflare:workers` through
 * their dependencies, so these guards assert against the source text instead
 * of loading the modules in a Node test runtime.
 *
 * They encode the runtime-access decision from the Thinkspace Agent runtime
 * PRD: no raw Project Think route is exposed to browsers; the only supported
 * entry points are the owner-gated oRPC procedures that talk to the Durable
 * Object by Thinkspace id.
 */
const sourceRoot = import.meta.url.includes("/dist/src/")
	? new URL("../../src/", import.meta.url)
	: new URL("./", import.meta.url);
const workerSource = readFileSync(new URL("index.ts", sourceRoot).pathname, "utf-8");
const agentSource = readFileSync(
	new URL("agents/thinkspace-agent.ts", sourceRoot).pathname,
	"utf-8",
);

test("the worker never mounts raw Project Think agent routes", () => {
	assert.doesNotMatch(workerSource, /routeAgentRequest/u);
	assert.doesNotMatch(workerSource, /routeAgentEmail/u);
	assert.doesNotMatch(workerSource, /"\/(?:api\/)?agents/u);
	assert.doesNotMatch(workerSource, /useAgentChat/u);
});

test("the worker only exposes known app-owned route prefixes", () => {
	const mountedRoutes = [
		...workerSource.matchAll(/app\.(?:use|on|get|post)\(\s*(?:\[[^\]]*\],\s*)?"(?<route>[^"]+)"/gu),
	].map((match) => {
		const route = match.groups?.route;
		assert.ok(route);
		return route;
	});

	assert.deepEqual(mountedRoutes, [
		"/*",
		"/api/auth/*",
		"/api/rpc/*",
		"/api/openapi/*",
		"/",
		"/api/health",
	]);
});

test("the Thinkspace Agent runtime keeps direct HTTP access fail-closed", () => {
	assert.match(agentSource, /override fetch\(/u);
	assert.match(agentSource, /status: 404/u);
});

test("the Thinkspace Agent runtime gets tool verdicts from the store-backed Permission policy", () => {
	assert.match(agentSource, /const permissionPolicy = createPermissionStorePolicy\(\{ db \}\)/u);
	assert.match(agentSource, /permissionPolicy\.evaluateToolPotency/u);
	assert.match(agentSource, /enablements: activeRevision\.toolEnablements/u);
	assert.doesNotMatch(agentSource, /toolPotencies:\s*\[\]/u);
});

test("the Thinkspace Agent runtime registers MCP tools only through grant-gated turn preparation", () => {
	assert.match(agentSource, /planThinkspaceMcpRuntimeTools/u);
	assert.match(agentSource, /prepareThinkspaceMcpRuntimeTools/u);
	assert.match(agentSource, /addMcpServer/u);
	assert.match(agentSource, /createThinkspaceRuntimeTurnConfig\(\{\s*activeTools:/u);
});

test("the Thinkspace Agent runtime rechecks Permission policy before MCP tool execution", () => {
	assert.match(agentSource, /override async beforeToolCall/u);
	assert.match(agentSource, /evaluateMcpRuntimeToolCallPermission/u);
	assert.match(agentSource, /const permissionPolicy = createPermissionStorePolicy\(\{ db \}\)/u);
	assert.match(agentSource, /action: "block"/u);
});

test("the Thinkspace Agent runtime gates built-in tools through the policy guard and call recheck", () => {
	assert.match(agentSource, /assertThinkspaceRuntimePolicySupportsBuiltInTools/u);
	assert.match(agentSource, /prepareThinkspaceBuiltInRuntimeTools/u);
	assert.match(agentSource, /evaluateBuiltInRuntimeToolCallPermission/u);
	assert.match(agentSource, /createThinkspaceSourceReader/u);
});
