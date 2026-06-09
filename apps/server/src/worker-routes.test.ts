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
const workerSource = readFileSync(new URL("index.ts", import.meta.url).pathname, "utf-8");
const agentSource = readFileSync(
	new URL("agents/thinkspace-agent.ts", import.meta.url).pathname,
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
		...workerSource.matchAll(/app\.(?:use|on|get|post)\(\s*(?:\[[^\]]*\],\s*)?"([^"]+)"/gu),
	].map((match) => match[1]);

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
