import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

/**
 * The worker and Durable Object modules import `cloudflare:workers` through
 * their dependencies, so these guards assert against the source text instead
 * of loading the modules in a Node test runtime.
 *
 * They encode the runtime-access decision from the Thinkspace Agent runtime
 * PRD, as narrowed by the Sittings slice: browser traffic reaches a runtime
 * only through the authenticated, owner-gated `/api/sittings/*` route; raw
 * Project Think route helpers stay banned, and the runtime stays fail-closed
 * to everything that is not a matching, worker-stamped Sitting forward.
 */
const sourceRoot = import.meta.url.includes("/dist/src/")
	? new URL("../../src/", import.meta.url)
	: new URL("./", import.meta.url);
const workerSource = readFileSync(new URL("index.ts", sourceRoot).pathname, "utf-8");
const agentSource = readFileSync(
	new URL("agents/thinkspace-agent.ts", sourceRoot).pathname,
	"utf-8",
);
const curatorAgentSource = readFileSync(
	new URL("agents/curator-agent.ts", sourceRoot).pathname,
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
		"/api/sittings/*",
		"/api/curator/*",
		"/",
		"/api/health",
	]);
});

test("the worker authenticates and owner-gates the Sitting route before forwarding", () => {
	// Session check, then ownership check, then forward — the same gate the
	// owner-gated turn procedures use. A non-owner or unauthenticated caller gets
	// the same 404 as a missing Thinkspace, so ownership is the only signal.
	assert.match(workerSource, /"\/api\/sittings\/\*"/u);
	assert.match(workerSource, /\.api\.getSession\(/u);
	assert.match(workerSource, /getOwnedThinkspaceAgentRuntimeReadiness\(/u);
	assert.match(workerSource, /return c\.notFound\(\)/u);
	// The worker strips any client-supplied forward header, then stamps its own.
	assert.match(workerSource, /forwardHeaders\.delete\(SITTING_FORWARD_CONTEXT_HEADER\)/u);
	assert.match(workerSource, /encodeSittingForwardContext\(/u);
	// Resolution is by Thinkspace id via the agents helper, never a raw router.
	assert.match(workerSource, /getAgentByName\(/u);
});

test("the worker authenticates and owner-gates the curation route before forwarding", () => {
	// The Curator creation seam mirrors the Sitting gate exactly: session check,
	// then draft-ownership check, then forward. A non-owner or unauthenticated
	// caller gets the same 404 as a missing draft, so ownership is the only signal.
	assert.match(workerSource, /"\/api\/curator\/\*"/u);
	assert.match(workerSource, /getOwnedCuratorAgentRuntimeReadiness\(/u);
	// The worker strips any client-supplied forward header, then stamps its own.
	assert.match(workerSource, /forwardHeaders\.delete\(CURATION_FORWARD_CONTEXT_HEADER\)/u);
	assert.match(workerSource, /encodeCurationForwardContext\(/u);
	assert.match(workerSource, /c\.env\.CURATOR_AGENT/u);
});

test("the Curator runtime keeps direct HTTP access fail-closed", () => {
	// The override defaults to 404; it admits only a worker-stamped curation
	// forward whose (owner, draft) matches the runtime's bound context, then hands
	// off to Project Think's chat protocol via super.fetch.
	assert.match(curatorAgentSource, /override async fetch\(/u);
	assert.match(curatorAgentSource, /status: 404/u);
	assert.match(curatorAgentSource, /decodeCurationForwardContext\(/u);
	assert.match(curatorAgentSource, /matchesCurationForwardContext\(/u);
	assert.match(curatorAgentSource, /return super\.fetch\(request\)/u);
});

test("the Curator runtime runs the ungated Curator model and assembles no mutation tools", () => {
	// The DO resolves the ungated Curator model (#124) in beforeTurn and ships no
	// mutation tools yet — "proposes, never grants" is structural from the start.
	assert.match(curatorAgentSource, /resolveCuratorModel\(/u);
	assert.match(curatorAgentSource, /override async beforeTurn\(/u);
	// The toolset is structurally empty in this skeleton — there is no activate or
	// grant tool to assemble, so "proposes, never grants" cannot regress here.
	assert.match(curatorAgentSource, /private readonly curatorToolSet: ToolSet = \{\}/u);
	assert.match(curatorAgentSource, /getTools\(\): ToolSet \{\s*return this\.curatorToolSet;/u);
});

test("the Thinkspace Agent runtime keeps direct HTTP access fail-closed", () => {
	// The override still defaults to 404; it admits only a worker-stamped Sitting
	// forward whose (owner, Thinkspace) matches the runtime's bound context, then
	// hands off to Project Think's chat protocol via super.fetch.
	assert.match(agentSource, /override async fetch\(/u);
	assert.match(agentSource, /status: 404/u);
	assert.match(agentSource, /decodeSittingForwardContext\(/u);
	assert.match(agentSource, /matchesSittingForwardContext\(/u);
	assert.match(agentSource, /return super\.fetch\(request\)/u);
});

test("the Thinkspace Agent runtime gets tool verdicts from the store-backed Permission policy", () => {
	assert.match(
		agentSource,
		/createPermissionStorePolicy\(\{\s*credentialedBuiltInMcpServerIds: credentialedBuiltInMcpServerIds\(this\.env\),\s*db,\s*\}\)/u,
	);
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
	assert.match(
		agentSource,
		/createPermissionStorePolicy\(\{\s*credentialedBuiltInMcpServerIds: credentialedBuiltInMcpServerIds\(this\.env\),\s*db,\s*\}\)/u,
	);
	assert.match(agentSource, /action: "block"/u);
});

test("the Thinkspace Agent runtime gates built-in tools through the policy guard and call recheck", () => {
	assert.match(agentSource, /assertThinkspaceRuntimePolicySupportsBuiltInTools/u);
	assert.match(agentSource, /prepareThinkspaceBuiltInRuntimeTools/u);
	assert.match(agentSource, /evaluateBuiltInRuntimeToolCallPermission/u);
	assert.match(agentSource, /createThinkspaceSourceReader/u);
});
