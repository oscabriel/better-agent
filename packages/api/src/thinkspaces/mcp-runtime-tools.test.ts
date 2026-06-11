import assert from "node:assert/strict";
import test from "node:test";

import type { ToolSet } from "ai";

import type { BuiltInMcpServer } from "../mcp/catalog";
import {
	createCloudflareAgentsMcpToolName,
	parseCloudflareAgentsMcpToolName,
} from "../mcp/tool-identity";
import type { ActiveAgentProfileRevision } from "./agent-profile";
import {
	createMemoryPermissionPolicy,
	createEnablementOnlyPermissionPolicy,
} from "./permission-policy";
import {
	createThinkspaceMcpDegradationNotice,
	evaluateMcpRuntimeToolCallPermission,
	planThinkspaceMcpRuntimeTools,
	prepareThinkspaceMcpRuntimeTools,
	selectActiveMcpRuntimeToolNames,
	THINKSPACE_MCP_TOOL_BLOCKED_REASON,
} from "./mcp-runtime-tools";

const NOW = new Date("2026-06-11T12:00:00.000Z");

const CLOUD_FLARE_DOCS: BuiltInMcpServer = {
	authType: "none",
	description: "Cloudflare documentation.",
	enabledByDefaultForThinkspaces: false,
	id: "cloudflare-docs",
	name: "Cloudflare Docs",
	riskLevel: "read_only",
	transport: "streamable_http",
	url: "https://docs.mcp.cloudflare.com/mcp",
};

const AWS_KNOWLEDGE: BuiltInMcpServer = {
	authType: "none",
	description: "AWS docs.",
	enabledByDefaultForThinkspaces: false,
	id: "aws-knowledge",
	name: "AWS Knowledge",
	riskLevel: "read_only",
	transport: "streamable_http",
	url: "https://knowledge-mcp.global.api.aws",
};

const CONTEXT7: BuiltInMcpServer = {
	authType: "api_key_header",
	description: "Code docs.",
	enabledByDefaultForThinkspaces: false,
	id: "context7",
	name: "Context7",
	riskLevel: "read_only",
	transport: "streamable_http",
	url: "https://mcp.context7.com/mcp",
};

const MUTATING_SERVER: BuiltInMcpServer = {
	authType: "none",
	description: "Mutating tools.",
	enabledByDefaultForThinkspaces: false,
	id: "mutating-docs",
	name: "Mutating Docs",
	riskLevel: "mutating",
	transport: "streamable_http",
	url: "https://mutating.example.com/mcp",
};

const createRevision = (
	toolEnablements: ActiveAgentProfileRevision["toolEnablements"],
): ActiveAgentProfileRevision => ({
	activatedAt: NOW,
	createdAt: NOW,
	id: "profile_revision_mcp_runtime",
	identity: { displayName: "Docs Agent", instructions: "Use docs when helpful." },
	modelBehavior: { modelId: "google:gemini-2.5-flash-lite", reasoningLevel: "medium" },
	routines: [],
	skillReferences: [],
	status: "active",
	thinkspaceId: "thinkspace_mcp_runtime",
	toolEnablements,
	updatedAt: NOW,
	version: 4,
});

const toolSet = (toolNames: string[]): ToolSet =>
	Object.fromEntries(toolNames.map((toolName) => [toolName, {} as never])) as ToolSet;

test("Cloudflare Agents MCP tool identity maps product server ids to runtime tool names", () => {
	const runtimeToolName = createCloudflareAgentsMcpToolName("cloudflare-docs", "search_docs");

	assert.equal(runtimeToolName, "tool_cloudflaredocs_search_docs");
	assert.deepEqual(parseCloudflareAgentsMcpToolName(runtimeToolName, ["cloudflare-docs"]), {
		modelAlias: "cloudflare-docs__search_docs",
		serverId: "cloudflare-docs",
		toolName: "search_docs",
	});
	assert.equal(parseCloudflareAgentsMcpToolName("web_search", ["cloudflare-docs"]), null);
});

test("turn MCP runtime planning connects only potent grantable built-in servers", () => {
	const revision = createRevision([
		{ source: "mcp_server", toolId: "cloudflare-docs" },
		{ source: "mcp_server", toolId: "aws-knowledge:search" },
		{ source: "mcp_server", toolId: "context7" },
		{ source: "mcp_server", toolId: "mutating-docs" },
		{ source: "built_in", toolId: "web_search" },
	]);

	const plan = planThinkspaceMcpRuntimeTools({
		activeProductToolIds: ["web_search", "cloudflare-docs", "context7", "mutating-docs"],
		builtInMcpServers: [CLOUD_FLARE_DOCS, AWS_KNOWLEDGE, CONTEXT7, MUTATING_SERVER],
		revision,
	});

	assert.deepEqual(
		plan.servers.map((server) => server.id),
		["cloudflare-docs"],
	);
	assert.deepEqual(plan.activeProductToolIds, ["cloudflare-docs"]);
});

test("inert MCP enablements produce no connection attempts and no active runtime tool", async () => {
	const revision = createRevision([{ source: "mcp_server", toolId: "cloudflare-docs" }]);
	const verdicts = await createEnablementOnlyPermissionPolicy().evaluateToolPotency({
		enablements: revision.toolEnablements,
		thinkspaceId: revision.thinkspaceId,
	});
	const activeProductToolIds = verdicts
		.filter((verdict) => verdict.potency === "potent")
		.map((verdict) => verdict.toolId);
	const plan = planThinkspaceMcpRuntimeTools({
		activeProductToolIds,
		builtInMcpServers: [CLOUD_FLARE_DOCS],
		revision,
	});
	let connectionAttempts = 0;

	const prepared = await prepareThinkspaceMcpRuntimeTools({
		activeProductToolIds: plan.activeProductToolIds,
		connectServer: () => {
			connectionAttempts += 1;
			return Promise.resolve(toolSet(["tool_cloudflaredocs_search_docs"]));
		},
		servers: plan.servers,
	});

	assert.deepEqual(plan.servers, []);
	assert.equal(connectionAttempts, 0);
	assert.deepEqual(prepared.activeToolNames, []);
	assert.deepEqual(prepared.tools, {});
});

test("preparation registers granted runtime tools and limits active tools to enabled scope", async () => {
	const runtimeTools = toolSet([
		"tool_cloudflaredocs_search_docs",
		"tool_cloudflaredocs_read_page",
		"tool_awsknowledge_search",
	]);
	const prepared = await prepareThinkspaceMcpRuntimeTools({
		activeProductToolIds: ["cloudflare-docs:search_docs", "aws-knowledge"],
		connectServer: ({ server }) => {
			assert.ok(["cloudflare-docs", "aws-knowledge"].includes(server.id));
			return Promise.resolve(runtimeTools);
		},
		servers: [CLOUD_FLARE_DOCS, AWS_KNOWLEDGE],
	});

	assert.deepEqual(prepared.connectedServerIds, ["cloudflare-docs", "aws-knowledge"]);
	assert.deepEqual(prepared.activeToolNames, [
		"tool_cloudflaredocs_search_docs",
		"tool_awsknowledge_search",
	]);
});

test("unreachable MCP servers degrade to model-only with a product-safe notice", async () => {
	const prepared = await prepareThinkspaceMcpRuntimeTools({
		activeProductToolIds: ["cloudflare-docs"],
		connectServer: () => Promise.reject(new Error("connect ECONNREFUSED mcp transport")),
		servers: [CLOUD_FLARE_DOCS],
	});
	const notice = createThinkspaceMcpDegradationNotice(prepared.degradedServers);

	assert.deepEqual(prepared.connectedServerIds, []);
	assert.deepEqual(prepared.activeToolNames, []);
	assert.deepEqual(prepared.tools, {});
	assert.equal(prepared.degradedServers[0]?.serverId, "cloudflare-docs");
	assert.ok(notice);
	assert.doesNotMatch(notice, /\b(?:mcp|server|runtime|transport|substrate)\b/iu);
	assert.match(notice, /external information source/u);
});

test("active runtime tool selection supports whole-server and one-tool enablements", () => {
	const activeToolNames = selectActiveMcpRuntimeToolNames({
		activeProductToolIds: ["cloudflare-docs", "aws-knowledge:search"],
		runtimeTools: toolSet([
			"tool_cloudflaredocs_search_docs",
			"tool_cloudflaredocs_read_page",
			"tool_awsknowledge_search",
			"tool_awsknowledge_other",
		]),
		serverIds: ["cloudflare-docs", "aws-knowledge"],
	});

	assert.deepEqual(activeToolNames, [
		"tool_cloudflaredocs_search_docs",
		"tool_cloudflaredocs_read_page",
		"tool_awsknowledge_search",
	]);
});

test("before-tool-call authorization uses the Permission policy seam for MCP tools", async () => {
	const revision = createRevision([{ source: "mcp_server", toolId: "cloudflare-docs" }]);
	const allowed = await evaluateMcpRuntimeToolCallPermission({
		builtInMcpServers: [CLOUD_FLARE_DOCS],
		permissionPolicy: createMemoryPermissionPolicy({ "cloudflare-docs": "potent" }),
		revision,
		runtimeToolName: "tool_cloudflaredocs_search_docs",
		thinkspaceId: revision.thinkspaceId,
	});
	const blocked = await evaluateMcpRuntimeToolCallPermission({
		builtInMcpServers: [CLOUD_FLARE_DOCS],
		permissionPolicy: createMemoryPermissionPolicy({ "cloudflare-docs": "inert" }),
		revision,
		runtimeToolName: "tool_cloudflaredocs_search_docs",
		thinkspaceId: revision.thinkspaceId,
	});
	const notMcp = await evaluateMcpRuntimeToolCallPermission({
		builtInMcpServers: [CLOUD_FLARE_DOCS],
		permissionPolicy: createMemoryPermissionPolicy({}),
		revision,
		runtimeToolName: "web_search",
		thinkspaceId: revision.thinkspaceId,
	});

	assert.equal(allowed.allowed, true);
	assert.equal(allowed.applies, true);
	assert.equal(allowed.productToolId, "cloudflare-docs:search_docs");
	assert.equal(blocked.allowed, false);
	assert.equal(blocked.reason, THINKSPACE_MCP_TOOL_BLOCKED_REASON);
	assert.equal(notMcp.applies, false);
	assert.equal(notMcp.allowed, true);
});
