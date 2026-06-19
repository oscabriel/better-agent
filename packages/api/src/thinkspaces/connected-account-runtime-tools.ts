/**
 * Connected-account (external-mutation) tools for the Thinkspace Agent turn
 * loop — the parallel of `built-in-runtime-tools.ts` for credentialed external
 * writes.
 *
 * External-mutation tools are connected-account tools whose action class is a
 * held external write. `create_github_issue` (product tool id
 * `github:create_issue`) is the first: it rides the `external_mutations`
 * capability — the held-external-write class — exactly as the held
 * Memory-proposing tool rides `memory_writes`, and it is held on the same Think
 * `needsApproval` holdpoint, so calling it records nothing until the owner
 * approves. The owner's credential is read only inside `execute`, which the AI
 * SDK runs only on an approved continuation; a rejected proposal never touches
 * the token (PRD #108, ADR-0009).
 *
 * This module owns: which tool ids are external mutations, the capability that
 * governs them, the fail-closed assembly guard, the held tool factory, the
 * turn-assembly preparation, and the call-boundary permission re-check.
 */
import { tool } from "ai";
import type { ToolSet } from "ai";
import { z } from "zod";

import { GitHubIssueCreationError } from "../connected-accounts/github-issues";
import type { ActiveAgentProfileRevision } from "./agent-profile";
import type { ThinkspaceGitHubIssueCreator } from "./github-issue-creator";
import { markThinkspaceTurnProductSafeError } from "./inspect";
import type { ThinkspacePermissionPolicy } from "./permission-policy";
import {
	isThinkspaceRuntimeCapabilityEnabled,
	THINKSPACE_RUNTIME_HELD_EXTERNAL_WRITE_CAPABILITY_ID,
	THINKSPACE_RUNTIME_POLICY,
} from "./runtime-policy";
import type { ThinkspaceRuntimeCapabilityId, ThinkspaceRuntimePolicy } from "./runtime-policy";

const POLICY_ASSEMBLY_MISMATCH_MESSAGE =
	"This Thinkspace Agent turn was stopped before it started: the runtime safety policy and the assembled tools disagree.";

export const THINKSPACE_CONNECTED_ACCOUNT_TOOL_BLOCKED_REASON =
	"This external mutation tool is not currently available for this Thinkspace Agent turn.";

export const THINKSPACE_GITHUB_ISSUE_TITLE_MAX_LENGTH = 256;
export const THINKSPACE_GITHUB_ISSUE_BODY_MAX_LENGTH = 60_000;
const GITHUB_REPO_MAX_LENGTH = 200;

/**
 * The held GitHub-issue tool. Its **runtime name** (the toolset key, the
 * `ctx.toolName` at the call boundary, and the `tool-create_github_issue`
 * transcript part) is `create_github_issue`; its **product tool id** (the
 * enablement id, the entry in `assembly.activeTools`, and the Permission keying)
 * is `github:create_issue` in the locked `${catalogId}:${toolName}` convention.
 */
export const CREATE_GITHUB_ISSUE_TOOL_NAME = "create_github_issue";
export const CREATE_GITHUB_ISSUE_TOOL_ID = "github:create_issue";

/**
 * The external-mutation product tool ids. `github:create_issue` is the only one
 * today; mirrors MCP's `serverId:tool` form and the connected-account
 * Permission/credential lookup.
 */
export const EXTERNAL_MUTATION_TOOL_IDS = [CREATE_GITHUB_ISSUE_TOOL_ID] as const;

export type ExternalMutationToolId = (typeof EXTERNAL_MUTATION_TOOL_IDS)[number];

export const isExternalMutationToolId = (value: string): value is ExternalMutationToolId =>
	EXTERNAL_MUTATION_TOOL_IDS.includes(value as ExternalMutationToolId);

const activeExternalMutationToolIds = (
	activeProductToolIds: readonly string[],
): ExternalMutationToolId[] => activeProductToolIds.filter(isExternalMutationToolId);

/** Maps a runtime tool name back to its product tool id; unknown names → null. */
const RUNTIME_TOOL_NAME_TO_PRODUCT_ID: Readonly<Record<string, ExternalMutationToolId>> = {
	[CREATE_GITHUB_ISSUE_TOOL_NAME]: CREATE_GITHUB_ISSUE_TOOL_ID,
};

export const connectedAccountRuntimeToolProductId = (
	runtimeToolName: string,
): ExternalMutationToolId | null => RUNTIME_TOOL_NAME_TO_PRODUCT_ID[runtimeToolName] ?? null;

/**
 * Which runtime capability class governs an external-mutation tool: every one
 * rides the `external_mutations` held-external-write class (the action-class
 * precedent set by `memory_write → memory_writes`; no separate source
 * capability). The fail-closed assembly guard uses this so an external-mutation
 * tool can never go active under a policy that has held external writes
 * disabled.
 */
export const externalMutationToolRuntimeCapabilityId = (
	_toolId: ExternalMutationToolId,
): ThinkspaceRuntimeCapabilityId => THINKSPACE_RUNTIME_HELD_EXTERNAL_WRITE_CAPABILITY_ID;

/**
 * The zero-blast-radius guarantee must survive bugs (PRD #92, #108), mirroring
 * the built-in-tools support assertion: if assembly produced an active
 * external-mutation tool while the runtime policy has held external writes
 * disabled — or workspace bash is not forced off — the turn fails
 * product-safely before any inference happens. A turn with no active
 * external-mutation tool passes untouched, so read-only and memory-only turns
 * behave exactly as before.
 */
export const assertThinkspaceRuntimePolicySupportsExternalMutationTools = ({
	activeProductToolIds,
	policy = THINKSPACE_RUNTIME_POLICY,
}: {
	activeProductToolIds: readonly string[];
	policy?: ThinkspaceRuntimePolicy;
}): void => {
	if (policy.workspaceBash !== false) {
		throw new Error(markThinkspaceTurnProductSafeError(POLICY_ASSEMBLY_MISMATCH_MESSAGE));
	}

	for (const toolId of activeExternalMutationToolIds(activeProductToolIds)) {
		if (
			!isThinkspaceRuntimeCapabilityEnabled(policy, externalMutationToolRuntimeCapabilityId(toolId))
		) {
			throw new Error(markThinkspaceTurnProductSafeError(POLICY_ASSEMBLY_MISMATCH_MESSAGE));
		}
	}
};

/**
 * Failure becomes a tool result, not an exception: the model sees an honest
 * product-safe sentence (never a fabricated success) and the bounded loop keeps
 * running. A typed `GitHubIssueCreationError` already carries owner-facing
 * guidance (including reconnect when the credential is the cause); anything else
 * collapses to a generic no-change message.
 */
const toExternalMutationToolFailure = (error: unknown): string => {
	if (error instanceof GitHubIssueCreationError) {
		return error.message;
	}

	return "This tool failed unexpectedly, so nothing was created. Mention the limitation rather than describing the action as done.";
};

/**
 * The held GitHub-issue-proposing tool. `needsApproval` is a constant `true`, so
 * the hold can never be ambiguous (fail closed). The AI SDK does not run
 * `execute` until the owner approves, so the credential fetch + GitHub write
 * inside it happen only on an approved continuation; a rejection never reaches
 * it and nothing is created.
 */
const createCreateGitHubIssueTool = (gitHubIssueCreator: ThinkspaceGitHubIssueCreator) =>
	tool({
		description:
			"Propose creating a GitHub issue in a connected repository — held for the owner's Approval, so calling it creates nothing until the owner approves the proposal. The repository must be given as owner/name.",
		execute: async ({ body, repo, title }) => {
			try {
				const issue = await gitHubIssueCreator.create({ body, repo, title });

				return `Created GitHub issue #${issue.number} in ${repo}: ${issue.url}`;
			} catch (error) {
				return toExternalMutationToolFailure(error);
			}
		},
		inputSchema: z.object({
			body: z
				.string()
				.min(1)
				.max(THINKSPACE_GITHUB_ISSUE_BODY_MAX_LENGTH)
				.describe("The issue body, as Markdown."),
			repo: z
				.string()
				.min(1)
				.max(GITHUB_REPO_MAX_LENGTH)
				.describe("The target repository as owner/name, e.g. octocat/hello-world."),
			title: z
				.string()
				.min(1)
				.max(THINKSPACE_GITHUB_ISSUE_TITLE_MAX_LENGTH)
				.describe("The issue title."),
		}),
		needsApproval: true,
	});

export interface PrepareThinkspaceConnectedAccountRuntimeToolsInput {
	activeProductToolIds: readonly string[];
	gitHubIssueCreator: ThinkspaceGitHubIssueCreator;
}

export interface ThinkspaceConnectedAccountRuntimePreparation {
	activeToolNames: string[];
	tools: ToolSet;
}

/**
 * Builds the connected-account half of the turn's toolset from the active set.
 * The active set already reflects enable ∩ potent (turn assembly) — this only
 * instantiates a tool definition for each external-mutation tool present, so
 * the tool is absent whenever its `external_mutations` capability is off or its
 * potency is inert.
 */
export const prepareThinkspaceConnectedAccountRuntimeTools = ({
	activeProductToolIds,
	gitHubIssueCreator,
}: PrepareThinkspaceConnectedAccountRuntimeToolsInput): ThinkspaceConnectedAccountRuntimePreparation => {
	const tools: ToolSet = {};

	for (const toolId of activeExternalMutationToolIds(activeProductToolIds)) {
		if (toolId === CREATE_GITHUB_ISSUE_TOOL_ID) {
			tools[CREATE_GITHUB_ISSUE_TOOL_NAME] = createCreateGitHubIssueTool(gitHubIssueCreator);
		}
	}

	return { activeToolNames: Object.keys(tools), tools };
};

export interface ThinkspaceConnectedAccountToolCallDecision {
	allowed: boolean;
	applies: boolean;
	reason?: string;
	toolId: ExternalMutationToolId | null;
}

/**
 * Defense in depth at the call boundary, mirroring the built-in and MCP
 * enforcement: a connected-account tool call is allowed only while its
 * enablement is still potent (enable ∩ grant ∩ credential-exists). Tools
 * outside the external-mutation catalog are not this evaluator's concern.
 */
export const evaluateConnectedAccountRuntimeToolCallPermission = async ({
	permissionPolicy,
	revision,
	runtimeToolName,
	thinkspaceId,
}: {
	permissionPolicy: ThinkspacePermissionPolicy;
	revision: ActiveAgentProfileRevision;
	runtimeToolName: string;
	thinkspaceId: string;
}): Promise<ThinkspaceConnectedAccountToolCallDecision> => {
	const productToolId = connectedAccountRuntimeToolProductId(runtimeToolName);

	if (!productToolId) {
		return { allowed: true, applies: false, toolId: null };
	}

	const enablements = revision.toolEnablements.filter(
		(enablement) =>
			enablement.source === "connected_account" && enablement.toolId === productToolId,
	);

	if (enablements.length === 0) {
		return {
			allowed: false,
			applies: true,
			reason: THINKSPACE_CONNECTED_ACCOUNT_TOOL_BLOCKED_REASON,
			toolId: productToolId,
		};
	}

	const verdicts = await permissionPolicy.evaluateToolPotency({ enablements, thinkspaceId });
	const allowed = verdicts.some((verdict) => verdict.potency === "potent");

	return {
		allowed,
		applies: true,
		reason: allowed ? undefined : THINKSPACE_CONNECTED_ACCOUNT_TOOL_BLOCKED_REASON,
		toolId: productToolId,
	};
};
