import assert from "node:assert/strict";
import test from "node:test";

import type { Tool, ToolCallOptions } from "ai";

import { SourceContentStorageError } from "../sources/content-store";
import type { ThinkspaceSourceReader } from "../sources/reader";
import type { ActiveAgentProfileRevision } from "./agent-profile";
import {
	assertThinkspaceRuntimePolicySupportsBuiltInTools,
	buildThinkspaceSourceManifest,
	evaluateBuiltInRuntimeToolCallPermission,
	prepareThinkspaceBuiltInRuntimeTools,
} from "./built-in-runtime-tools";
import type { ThinkspaceMemoryWriteInput, ThinkspaceMemoryWriter } from "./memory-writer";
import { createMemoryPermissionPolicy } from "./permission-policy";
import { THINKSPACE_RUNTIME_POLICY } from "./runtime-policy";
import { ThinkspaceWebReadError } from "./web-reader";
import type { ThinkspaceWebReader } from "./web-reader";

const TOOL_CALL_OPTIONS = { messages: [], toolCallId: "tool_call_1" } as ToolCallOptions;

const executeTool = async (toolDefinition: Tool | undefined, input: unknown): Promise<string> => {
	assert.ok(toolDefinition?.execute, "tool must be constructed with an execute handler");

	return (await toolDefinition.execute(input as never, TOOL_CALL_OPTIONS)) as string;
};

const stubWebReader = (overrides: Partial<ThinkspaceWebReader> = {}): ThinkspaceWebReader => ({
	fetchPage: () => Promise.resolve("page content"),
	search: () => Promise.resolve("search results"),
	...overrides,
});

const stubSourceReader = (
	overrides: Partial<ThinkspaceSourceReader> = {},
): ThinkspaceSourceReader => ({
	listManifest: () => Promise.resolve([]),
	read: () => Promise.resolve(null),
	...overrides,
});

const stubMemoryWriter = (
	overrides: Partial<ThinkspaceMemoryWriter> = {},
): ThinkspaceMemoryWriter => ({
	write: () => Promise.resolve(),
	...overrides,
});

const recordingMemoryWriter = (): {
	writer: ThinkspaceMemoryWriter;
	writes: ThinkspaceMemoryWriteInput[];
} => {
	const writes: ThinkspaceMemoryWriteInput[] = [];

	return {
		writer: {
			write: (input) => {
				writes.push(input);

				return Promise.resolve();
			},
		},
		writes,
	};
};

test("only active built-in tools are constructed; unknown and MCP ids construct nothing", async () => {
	const preparation = await prepareThinkspaceBuiltInRuntimeTools({
		activeProductToolIds: ["web_search", "cloudflare-docs:search_docs", "workspace_bash"],
		memoryWriter: stubMemoryWriter(),
		sourceReader: stubSourceReader(),
		webReader: stubWebReader(),
	});

	assert.deepEqual(preparation.activeToolNames, ["web_search"]);
	assert.deepEqual(Object.keys(preparation.tools), ["web_search"]);
	assert.equal(preparation.sourceManifestNotice, null);
});

test("an empty active set keeps the toolset empty with no manifest", async () => {
	const preparation = await prepareThinkspaceBuiltInRuntimeTools({
		activeProductToolIds: [],
		memoryWriter: stubMemoryWriter(),
		sourceReader: stubSourceReader(),
		webReader: stubWebReader(),
	});

	assert.deepEqual(preparation.tools, {});
	assert.deepEqual(preparation.activeToolNames, []);
	assert.equal(preparation.sourceManifestNotice, null);
});

test("source_read returns the Source content and a product-safe not-found for forged ids", async () => {
	const preparation = await prepareThinkspaceBuiltInRuntimeTools({
		activeProductToolIds: ["source_read"],
		memoryWriter: stubMemoryWriter(),
		sourceReader: stubSourceReader({
			listManifest: () =>
				Promise.resolve([
					{ description: "Pricing notes", id: "source_a", name: "Vendor pricing", sizeBytes: 2048 },
				]),
			read: (sourceId) =>
				Promise.resolve(
					sourceId === "source_a"
						? {
								content: "Vendor A: $99/mo.",
								description: "Pricing notes",
								id: "source_a",
								name: "Vendor pricing",
								sizeBytes: 2048,
							}
						: null,
				),
		}),
		webReader: stubWebReader(),
	});

	const found = await executeTool(preparation.tools.source_read, { sourceId: "source_a" });
	assert.match(found, /Vendor pricing/u);
	assert.match(found, /Vendor A: \$99\/mo\./u);

	// A forged or stale id resolves to a product-safe sentence, not an error.
	const forged = await executeTool(preparation.tools.source_read, {
		sourceId: "source_from_another_thinkspace",
	});
	assert.match(forged, /not available in this Thinkspace/u);
	assert.doesNotMatch(forged, /R2|bucket|binding/iu);
});

test("the Source manifest is injected when source_read is active and reflects the Thinkspace's Sources", async () => {
	const preparation = await prepareThinkspaceBuiltInRuntimeTools({
		activeProductToolIds: ["source_read", "web_search"],
		memoryWriter: stubMemoryWriter(),
		sourceReader: stubSourceReader({
			listManifest: () =>
				Promise.resolve([
					{ description: "Pricing notes", id: "source_a", name: "Vendor pricing", sizeBytes: 2048 },
					{ description: "", id: "source_b", name: "Requirements", sizeBytes: 100 },
				]),
		}),
		webReader: stubWebReader(),
	});

	assert.ok(preparation.sourceManifestNotice);
	assert.match(
		preparation.sourceManifestNotice,
		/source_a: "Vendor pricing" \(2\.0 KB\) — Pricing notes/u,
	);
	assert.match(preparation.sourceManifestNotice, /source_b: "Requirements" \(100 B\)/u);
	assert.match(preparation.sourceManifestNotice, /source_read/u);
});

test("a Thinkspace with no Sources gets an explicit empty manifest", () => {
	const manifest = buildThinkspaceSourceManifest([]);

	assert.match(manifest, /no Sources yet/u);
});

test("a manifest listing failure degrades into a product-safe notice instead of failing the turn", async () => {
	const preparation = await prepareThinkspaceBuiltInRuntimeTools({
		activeProductToolIds: ["source_read"],
		memoryWriter: stubMemoryWriter(),
		sourceReader: stubSourceReader({
			listManifest: () => Promise.reject(new Error("D1_ERROR: no such table")),
		}),
		webReader: stubWebReader(),
	});

	assert.ok(preparation.sourceManifestNotice);
	assert.match(preparation.sourceManifestNotice, /temporarily unavailable/u);
	assert.doesNotMatch(preparation.sourceManifestNotice, /D1_ERROR/u);
	assert.deepEqual(preparation.activeToolNames, ["source_read"]);
});

test("web and Source tool failures resolve to product-safe messages without transport detail", async () => {
	const preparation = await prepareThinkspaceBuiltInRuntimeTools({
		activeProductToolIds: ["web_search", "web_fetch", "source_read"],
		memoryWriter: stubMemoryWriter(),
		sourceReader: stubSourceReader({
			read: () => Promise.reject(new SourceContentStorageError()),
		}),
		webReader: stubWebReader({
			fetchPage: () =>
				Promise.reject(
					new ThinkspaceWebReadError("That web page could not be fetched for this turn."),
				),
			search: () => Promise.reject(new Error("ECONNREFUSED 104.16.0.1:443")),
		}),
	});

	const searchFailure = await executeTool(preparation.tools.web_search, { query: "anything" });
	assert.match(searchFailure, /failed unexpectedly/u);
	assert.doesNotMatch(searchFailure, /ECONNREFUSED/u);

	const fetchFailure = await executeTool(preparation.tools.web_fetch, {
		url: "https://example.com",
	});
	assert.match(fetchFailure, /could not be fetched/u);

	const sourceFailure = await executeTool(preparation.tools.source_read, { sourceId: "source_a" });
	assert.match(sourceFailure, /Source storage is unavailable right now/u);
	assert.doesNotMatch(sourceFailure, /R2|bucket|binding/iu);
});

test("memory_write is constructed when active, declares its hold, and writes only through the writer on an approved execute", async () => {
	const { writer, writes } = recordingMemoryWriter();
	const preparation = await prepareThinkspaceBuiltInRuntimeTools({
		activeProductToolIds: ["memory_write"],
		memoryWriter: writer,
		sourceReader: stubSourceReader(),
		webReader: stubWebReader(),
	});

	assert.deepEqual(preparation.activeToolNames, ["memory_write"]);
	// The hold is constant so it can never be ambiguous: the runtime always
	// parks this tool for the owner rather than executing it inline.
	assert.equal((preparation.tools.memory_write as Tool).needsApproval, true);

	// execute only ever runs on an approved continuation; when it does, the
	// proposed Memory flows through the writer keyed by the held tool call.
	const result = await executeTool(preparation.tools.memory_write, {
		content: "The user prefers Vendor A for its pricing.",
	});
	assert.match(result, /Recorded a durable Product Memory/u);
	assert.deepEqual(writes, [
		{ content: "The user prefers Vendor A for its pricing.", toolCallId: "tool_call_1" },
	]);
});

test("a memory_write storage failure resolves to a product-safe message without transport detail", async () => {
	const preparation = await prepareThinkspaceBuiltInRuntimeTools({
		activeProductToolIds: ["memory_write"],
		memoryWriter: stubMemoryWriter({
			write: () => Promise.reject(new Error("D1_ERROR: database is locked")),
		}),
		sourceReader: stubSourceReader(),
		webReader: stubWebReader(),
	});

	const failure = await executeTool(preparation.tools.memory_write, { content: "Anything." });
	assert.match(failure, /failed unexpectedly/u);
	assert.doesNotMatch(failure, /D1_ERROR/u);
});

test("the policy guard passes for the shipped policy and active built-ins", () => {
	assert.doesNotThrow(() =>
		assertThinkspaceRuntimePolicySupportsBuiltInTools({
			activeProductToolIds: ["web_search", "source_read", "memory_write"],
		}),
	);
});

test("the policy guard gates memory_write on the held-write capability, not the read capability", () => {
	// A policy with held internal writes disabled but reads enabled must reject
	// an assembled memory_write while still admitting the read tools.
	const noHeldWritesPolicy = {
		...THINKSPACE_RUNTIME_POLICY,
		capabilities: THINKSPACE_RUNTIME_POLICY.capabilities.map((capability) =>
			capability.id === "memory_writes" ? { ...capability, enabled: false } : capability,
		),
	};

	assert.throws(
		() =>
			assertThinkspaceRuntimePolicySupportsBuiltInTools({
				activeProductToolIds: ["memory_write"],
				policy: noHeldWritesPolicy,
			}),
		/thinkspace-turn-product-safe:.*runtime safety policy/u,
	);

	assert.doesNotThrow(() =>
		assertThinkspaceRuntimePolicySupportsBuiltInTools({
			activeProductToolIds: ["web_search"],
			policy: noHeldWritesPolicy,
		}),
	);
});

test("the policy guard fails closed before inference when the capability and assembly disagree", () => {
	const disabledPolicy = {
		...THINKSPACE_RUNTIME_POLICY,
		capabilities: THINKSPACE_RUNTIME_POLICY.capabilities.map((capability) => ({
			...capability,
			enabled: false,
		})),
	};

	assert.throws(
		() =>
			assertThinkspaceRuntimePolicySupportsBuiltInTools({
				activeProductToolIds: ["web_search"],
				policy: disabledPolicy,
			}),
		/thinkspace-turn-product-safe:.*runtime safety policy/u,
	);

	// No active built-ins: the disabled capability is consistent with assembly.
	assert.doesNotThrow(() =>
		assertThinkspaceRuntimePolicySupportsBuiltInTools({
			activeProductToolIds: ["cloudflare-docs"],
			policy: disabledPolicy,
		}),
	);
});

test("the policy guard fails closed if workspace bash is ever not forced off", () => {
	const bashPolicy = {
		...THINKSPACE_RUNTIME_POLICY,
		workspaceBash: true as unknown as false,
	};

	assert.throws(
		() =>
			assertThinkspaceRuntimePolicySupportsBuiltInTools({
				activeProductToolIds: [],
				policy: bashPolicy,
			}),
		/thinkspace-turn-product-safe:/u,
	);
});

const REVISION_WITH_BUILT_INS = {
	id: "rev_built_in",
	identity: { displayName: "Vendor Analyst", instructions: "Research vendors." },
	modelBehavior: { modelId: "google:gemini-2.5-flash-lite", reasoningLevel: "medium" },
	status: "active",
	toolEnablements: [
		{ source: "built_in", toolId: "web_search" },
		{ source: "built_in", toolId: "source_read" },
	],
	version: 1,
} as unknown as ActiveAgentProfileRevision;

test("beforeToolCall enforcement allows potent built-ins, blocks inert ones, and ignores other tools", async () => {
	const permissionPolicy = createMemoryPermissionPolicy({ web_search: "potent" });

	const potent = await evaluateBuiltInRuntimeToolCallPermission({
		permissionPolicy,
		revision: REVISION_WITH_BUILT_INS,
		runtimeToolName: "web_search",
		thinkspaceId: "thinkspace_1",
	});
	assert.deepEqual(
		{ allowed: potent.allowed, applies: potent.applies },
		{ allowed: true, applies: true },
	);

	const inert = await evaluateBuiltInRuntimeToolCallPermission({
		permissionPolicy,
		revision: REVISION_WITH_BUILT_INS,
		runtimeToolName: "source_read",
		thinkspaceId: "thinkspace_1",
	});
	assert.equal(inert.allowed, false);
	assert.equal(inert.applies, true);
	assert.match(inert.reason ?? "", /not currently available/u);

	const notEnabled = await evaluateBuiltInRuntimeToolCallPermission({
		permissionPolicy: createMemoryPermissionPolicy({ web_fetch: "potent" }),
		revision: REVISION_WITH_BUILT_INS,
		runtimeToolName: "web_fetch",
		thinkspaceId: "thinkspace_1",
	});
	assert.equal(notEnabled.allowed, false);

	const notBuiltIn = await evaluateBuiltInRuntimeToolCallPermission({
		permissionPolicy,
		revision: REVISION_WITH_BUILT_INS,
		runtimeToolName: "mcp_cloudflare-docs_search_docs",
		thinkspaceId: "thinkspace_1",
	});
	assert.deepEqual(
		{ allowed: notBuiltIn.allowed, applies: notBuiltIn.applies },
		{ allowed: true, applies: false },
	);
});
