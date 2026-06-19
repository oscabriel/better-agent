import assert from "node:assert/strict";
import test from "node:test";

import type { Tool, ToolCallOptions } from "ai";

import { GitHubIssueCreationError } from "../connected-accounts/github-issues";
import type { ActiveAgentProfileRevision } from "./agent-profile";
import {
	assertThinkspaceRuntimePolicySupportsExternalMutationTools,
	connectedAccountRuntimeToolProductId,
	CREATE_GITHUB_ISSUE_TOOL_ID,
	CREATE_GITHUB_ISSUE_TOOL_NAME,
	EXTERNAL_MUTATION_TOOL_IDS,
	evaluateConnectedAccountRuntimeToolCallPermission,
	externalMutationToolRuntimeCapabilityId,
	isExternalMutationToolId,
	prepareThinkspaceConnectedAccountRuntimeTools,
} from "./connected-account-runtime-tools";
import type { ThinkspaceGitHubIssueCreator } from "./github-issue-creator";
import { createMemoryPermissionPolicy } from "./permission-policy";
import { THINKSPACE_RUNTIME_POLICY } from "./runtime-policy";

const TOOL_CALL_OPTIONS = { messages: [], toolCallId: "tool_call_1" } as ToolCallOptions;

const executeTool = async (toolDefinition: Tool | undefined, input: unknown): Promise<string> => {
	assert.ok(toolDefinition?.execute, "tool must be constructed with an execute handler");

	return (await toolDefinition.execute(input as never, TOOL_CALL_OPTIONS)) as string;
};

const recordingIssueCreator = (
	impl: ThinkspaceGitHubIssueCreator["create"],
): {
	calls: { body: string; repo: string; title: string }[];
	creator: ThinkspaceGitHubIssueCreator;
} => {
	const calls: { body: string; repo: string; title: string }[] = [];

	return {
		calls,
		creator: {
			create: (proposal) => {
				calls.push(proposal);

				return impl(proposal);
			},
		},
	};
};

const REVISION_WITH_GITHUB_ISSUE = {
	toolEnablements: [{ source: "connected_account", toolId: CREATE_GITHUB_ISSUE_TOOL_ID }],
} as unknown as ActiveAgentProfileRevision;

test("recognizes only the catalog-keyed external-mutation tool ids", () => {
	assert.deepEqual([...EXTERNAL_MUTATION_TOOL_IDS], ["github:create_issue"]);

	assert.equal(isExternalMutationToolId("github:create_issue"), true);

	// The bare runtime name, the catalog id alone, a read tool, an MCP tool, and
	// the empty string are all rejected — matching happens on the product id.
	assert.equal(isExternalMutationToolId("create_github_issue"), false);
	assert.equal(isExternalMutationToolId("github"), false);
	assert.equal(isExternalMutationToolId("memory_write"), false);
	assert.equal(isExternalMutationToolId("cloudflare-docs:search_docs"), false);
	assert.equal(isExternalMutationToolId(""), false);
});

test("maps every external-mutation tool to the held-external-write capability", () => {
	assert.equal(
		externalMutationToolRuntimeCapabilityId("github:create_issue"),
		"external_mutations",
	);
});

test("the policy guard passes for the shipped policy with the external-mutation tool active", () => {
	assert.doesNotThrow(() =>
		assertThinkspaceRuntimePolicySupportsExternalMutationTools({
			activeProductToolIds: ["github:create_issue"],
		}),
	);
});

test("the policy guard is a no-op for revisions with no potent external-mutation tool", () => {
	// Read-only and memory-only turns: the guard never sees an external-mutation
	// tool, so assembly output is untouched even when the capability is enabled.
	assert.doesNotThrow(() =>
		assertThinkspaceRuntimePolicySupportsExternalMutationTools({
			activeProductToolIds: ["web_search", "source_read", "memory_write"],
		}),
	);
	assert.doesNotThrow(() =>
		assertThinkspaceRuntimePolicySupportsExternalMutationTools({
			activeProductToolIds: [],
		}),
	);
});

test("the policy guard gates external mutations on the held-external-write capability", () => {
	// A policy with held external writes disabled must reject an assembled
	// external-mutation tool while still admitting non-external tools.
	const noExternalWritesPolicy = {
		...THINKSPACE_RUNTIME_POLICY,
		capabilities: THINKSPACE_RUNTIME_POLICY.capabilities.map((capability) =>
			capability.id === "external_mutations" ? { ...capability, enabled: false } : capability,
		),
	};

	assert.throws(
		() =>
			assertThinkspaceRuntimePolicySupportsExternalMutationTools({
				activeProductToolIds: ["github:create_issue"],
				policy: noExternalWritesPolicy,
			}),
		/thinkspace-turn-product-safe:.*runtime safety policy/u,
	);

	assert.doesNotThrow(() =>
		assertThinkspaceRuntimePolicySupportsExternalMutationTools({
			activeProductToolIds: ["web_search"],
			policy: noExternalWritesPolicy,
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
			assertThinkspaceRuntimePolicySupportsExternalMutationTools({
				activeProductToolIds: [],
				policy: bashPolicy,
			}),
		/thinkspace-turn-product-safe:/u,
	);
});

test("maps the runtime tool name back to its product tool id", () => {
	assert.equal(
		connectedAccountRuntimeToolProductId(CREATE_GITHUB_ISSUE_TOOL_NAME),
		CREATE_GITHUB_ISSUE_TOOL_ID,
	);
	assert.equal(connectedAccountRuntimeToolProductId("github:create_issue"), null);
	assert.equal(connectedAccountRuntimeToolProductId("web_search"), null);
});

test("prepare assembles the held tool only when its product id is active", () => {
	const { creator } = recordingIssueCreator(() =>
		Promise.resolve({ number: 1, url: "https://github.com/o/r/issues/1" }),
	);

	const absent = prepareThinkspaceConnectedAccountRuntimeTools({
		activeProductToolIds: ["web_search", "memory_write"],
		gitHubIssueCreator: creator,
	});
	assert.deepEqual(absent.tools, {});
	assert.deepEqual(absent.activeToolNames, []);

	const present = prepareThinkspaceConnectedAccountRuntimeTools({
		activeProductToolIds: [CREATE_GITHUB_ISSUE_TOOL_ID],
		gitHubIssueCreator: creator,
	});
	assert.deepEqual(present.activeToolNames, [CREATE_GITHUB_ISSUE_TOOL_NAME]);
	assert.equal((present.tools[CREATE_GITHUB_ISSUE_TOOL_NAME] as Tool).needsApproval, true);
});

test("the credential is read only inside execute: preparing the tool never creates anything", async () => {
	const { calls, creator } = recordingIssueCreator(() =>
		Promise.resolve({ number: 11, url: "https://github.com/octocat/x/issues/11" }),
	);

	const preparation = prepareThinkspaceConnectedAccountRuntimeTools({
		activeProductToolIds: [CREATE_GITHUB_ISSUE_TOOL_ID],
		gitHubIssueCreator: creator,
	});

	// Assembling the tool (the held proposal stage) touches the creator zero
	// times; a rejected proposal whose execute never runs reads no credential.
	assert.equal(calls.length, 0);

	// Only running execute (the owner-approved continuation) reaches the creator.
	const result = await executeTool(preparation.tools[CREATE_GITHUB_ISSUE_TOOL_NAME], {
		body: "Steps.",
		repo: "octocat/x",
		title: "Bug",
	});
	assert.equal(calls.length, 1);
	assert.match(result, /Created GitHub issue #11/u);
	assert.match(result, /octocat\/x/u);
});

test("execute returns an honest reconnect message on a dead token and never fabricates success", async () => {
	const { creator } = recordingIssueCreator(() =>
		Promise.reject(
			new GitHubIssueCreationError("GitHub rejected the connected account's credential.", {
				needsReconnect: true,
			}),
		),
	);

	const preparation = prepareThinkspaceConnectedAccountRuntimeTools({
		activeProductToolIds: [CREATE_GITHUB_ISSUE_TOOL_ID],
		gitHubIssueCreator: creator,
	});

	const result = await executeTool(preparation.tools[CREATE_GITHUB_ISSUE_TOOL_NAME], {
		body: "B",
		repo: "octocat/x",
		title: "T",
	});

	assert.match(result, /rejected the connected account's credential/u);
	assert.doesNotMatch(result, /Created GitHub issue/u);
});

test("execute degrades an unexpected error to a product-safe no-change message", async () => {
	const { creator } = recordingIssueCreator(() => Promise.reject(new Error("boom")));

	const preparation = prepareThinkspaceConnectedAccountRuntimeTools({
		activeProductToolIds: [CREATE_GITHUB_ISSUE_TOOL_ID],
		gitHubIssueCreator: creator,
	});

	const result = await executeTool(preparation.tools[CREATE_GITHUB_ISSUE_TOOL_NAME], {
		body: "B",
		repo: "octocat/x",
		title: "T",
	});

	assert.match(result, /nothing was created/u);
	assert.doesNotMatch(result, /Created GitHub issue/u);
});

test("the call boundary allows the held tool only while its enablement is potent", async () => {
	const potent = await evaluateConnectedAccountRuntimeToolCallPermission({
		permissionPolicy: createMemoryPermissionPolicy({ [CREATE_GITHUB_ISSUE_TOOL_ID]: "potent" }),
		revision: REVISION_WITH_GITHUB_ISSUE,
		runtimeToolName: CREATE_GITHUB_ISSUE_TOOL_NAME,
		thinkspaceId: "thinkspace_1",
	});
	assert.deepEqual(
		{ allowed: potent.allowed, applies: potent.applies },
		{ allowed: true, applies: true },
	);

	const inert = await evaluateConnectedAccountRuntimeToolCallPermission({
		permissionPolicy: createMemoryPermissionPolicy({ [CREATE_GITHUB_ISSUE_TOOL_ID]: "inert" }),
		revision: REVISION_WITH_GITHUB_ISSUE,
		runtimeToolName: CREATE_GITHUB_ISSUE_TOOL_NAME,
		thinkspaceId: "thinkspace_1",
	});
	assert.equal(inert.allowed, false);
	assert.equal(inert.applies, true);
	assert.match(inert.reason ?? "", /not currently available/u);

	const notEnabled = await evaluateConnectedAccountRuntimeToolCallPermission({
		permissionPolicy: createMemoryPermissionPolicy({ [CREATE_GITHUB_ISSUE_TOOL_ID]: "potent" }),
		revision: { toolEnablements: [] } as unknown as ActiveAgentProfileRevision,
		runtimeToolName: CREATE_GITHUB_ISSUE_TOOL_NAME,
		thinkspaceId: "thinkspace_1",
	});
	assert.equal(notEnabled.allowed, false);
	assert.equal(notEnabled.applies, true);

	const notConnectedAccount = await evaluateConnectedAccountRuntimeToolCallPermission({
		permissionPolicy: createMemoryPermissionPolicy({}),
		revision: REVISION_WITH_GITHUB_ISSUE,
		runtimeToolName: "web_search",
		thinkspaceId: "thinkspace_1",
	});
	assert.deepEqual(
		{ allowed: notConnectedAccount.allowed, applies: notConnectedAccount.applies },
		{ allowed: true, applies: false },
	);
});
