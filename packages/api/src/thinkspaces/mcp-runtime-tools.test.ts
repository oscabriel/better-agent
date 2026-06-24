import assert from "node:assert/strict";
import test from "node:test";

import { user } from "@better-agent/db/schema/auth";
import {
	THINKSPACE_PERMISSION_KINDS,
	thinkspacePermissions,
} from "@better-agent/db/schema/permissions";
import { thinkspaces } from "@better-agent/db/schema/thinkspaces";
import type { ToolSet } from "ai";

import type { BuiltInMcpServer } from "../mcp/catalog";
import {
	createCloudflareAgentsMcpToolName,
	parseCloudflareAgentsMcpToolName,
} from "../mcp/tool-identity";
import { createTestProductDb } from "../testing/product-db";
import type { ActiveAgentProfileRevision } from "./agent-profile";
import { revokeThinkspacePermission } from "./permissions";
import {
	createMemoryPermissionPolicy,
	createEnablementOnlyPermissionPolicy,
	createPermissionStorePolicy,
} from "./permission-policy";
import { assembleThinkspaceTurn } from "./turn-assembly";
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

const seedGrantedMcpRuntimeDb = async () => {
	const db = createTestProductDb();

	await db.insert(user).values({
		email: "mcp-runtime-owner@example.com",
		id: "user_mcp_runtime",
		name: "Owner",
	});
	await db.insert(thinkspaces).values({
		goal: "Read docs.",
		id: "thinkspace_mcp_runtime",
		ownerUserId: "user_mcp_runtime",
	});
	await db.insert(thinkspacePermissions).values({
		grantedByUserId: "user_mcp_runtime",
		id: "thinkspace_permission_cloudflare_docs",
		kind: THINKSPACE_PERMISSION_KINDS.MCP_TOOL_ACCESS,
		providerId: "cloudflare-docs",
		resourceScope: JSON.stringify({ type: "server" }),
		thinkspaceId: "thinkspace_mcp_runtime",
	});

	return db;
};

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

test("turn MCP runtime planning connects every active server, auth-free or authed", () => {
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

	// An authed server reaching planning has already passed the credential-exists
	// potency axis (it would be inert without a resolvable credential), so it
	// connects with its credential injected at the transport. The mutating
	// server connects too — its tools are held for Approval, not dropped.
	assert.deepEqual(
		plan.servers.map((server) => server.id),
		["cloudflare-docs", "context7", "mutating-docs"],
	);
	assert.deepEqual(plan.activeProductToolIds, ["cloudflare-docs", "context7", "mutating-docs"]);
});

test("preparation holds every tool from a mutating server for Approval, leaving read-only tools inline", async () => {
	const prepared = await prepareThinkspaceMcpRuntimeTools({
		activeProductToolIds: ["cloudflare-docs", "mutating-docs"],
		connectServer: ({ server }) =>
			Promise.resolve(
				server.id === "mutating-docs"
					? toolSet(["tool_mutatingdocs_open_pr"])
					: toolSet(["tool_cloudflaredocs_search_docs"]),
			),
		servers: [CLOUD_FLARE_DOCS, MUTATING_SERVER],
	});

	assert.equal(
		(prepared.tools.tool_mutatingdocs_open_pr as { needsApproval?: boolean }).needsApproval,
		true,
	);
	assert.equal(
		(prepared.tools.tool_cloudflaredocs_search_docs as { needsApproval?: boolean }).needsApproval,
		undefined,
	);
});

test("an authed mutating server connects and still holds every tool for Approval", async () => {
	const authedMutatingServer: BuiltInMcpServer = {
		...MUTATING_SERVER,
		authType: "api_key_header",
		id: "authed-mutating",
		name: "Authed Mutating",
	};

	// Auth and risk are orthogonal: a credentialed authed server connects (its
	// credential is injected at the transport in the runtime), and because it is
	// mutating its tools are still held for the owner's Approval (ADR-0003).
	const prepared = await prepareThinkspaceMcpRuntimeTools({
		activeProductToolIds: ["authed-mutating"],
		connectServer: ({ server }) => {
			assert.equal(server.id, "authed-mutating");
			return Promise.resolve(toolSet(["tool_authedmutating_open_pr"]));
		},
		servers: [authedMutatingServer],
	});

	assert.deepEqual(prepared.connectedServerIds, ["authed-mutating"]);
	assert.equal(
		(prepared.tools.tool_authedmutating_open_pr as { needsApproval?: boolean }).needsApproval,
		true,
	);
});

test("before-tool-call authorization allows a potent mutating-server tool (held, not blocked)", async () => {
	const revision = createRevision([{ source: "mcp_server", toolId: "mutating-docs" }]);
	const decision = await evaluateMcpRuntimeToolCallPermission({
		builtInMcpServers: [MUTATING_SERVER],
		permissionPolicy: createMemoryPermissionPolicy({ "mutating-docs": "potent" }),
		revision,
		runtimeToolName: "tool_mutatingdocs_open_pr",
		thinkspaceId: revision.thinkspaceId,
	});

	assert.equal(decision.applies, true);
	assert.equal(decision.allowed, true);
	assert.equal(decision.productToolId, "mutating-docs:open_pr");
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

test("revoked MCP grants make next-turn preparation skip the server connection", async () => {
	const db = await seedGrantedMcpRuntimeDb();
	const revision = createRevision([{ source: "mcp_server", toolId: "cloudflare-docs" }]);
	const policy = createPermissionStorePolicy({ db });
	const grantedVerdicts = await policy.evaluateToolPotency({
		enablements: revision.toolEnablements,
		thinkspaceId: revision.thinkspaceId,
	});
	assert.deepEqual(grantedVerdicts, [{ potency: "potent", toolId: "cloudflare-docs" }]);

	const revoked = await revokeThinkspacePermission(db, {
		permissionId: "thinkspace_permission_cloudflare_docs",
		thinkspaceId: revision.thinkspaceId,
	});
	assert.ok(revoked);

	const revokedVerdicts = await policy.evaluateToolPotency({
		enablements: revision.toolEnablements,
		thinkspaceId: revision.thinkspaceId,
	});
	const assembly = assembleThinkspaceTurn({ revision, toolPotencies: revokedVerdicts });
	const plan = planThinkspaceMcpRuntimeTools({
		activeProductToolIds: assembly.activeTools,
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

	assert.deepEqual(revokedVerdicts, [{ potency: "inert", toolId: "cloudflare-docs" }]);
	assert.deepEqual(assembly.activeTools, []);
	assert.deepEqual(plan.servers, []);
	assert.equal(connectionAttempts, 0);
	assert.deepEqual(prepared.activeToolNames, []);
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
