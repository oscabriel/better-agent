/**
 * Built-in read tools for the Thinkspace Agent turn loop.
 *
 * The factory constructs tool definitions for exactly the built-in tools the
 * turn assembly judged active (enabled ∩ potent) — an empty active set keeps
 * the toolset empty and the turn model-only. Every tool execution failure
 * resolves to a product-safe message inside the turn so the agent can
 * continue or report the gap; transport detail never reaches the model and
 * the durable turn machinery never aborts on a read failure.
 */
import { tool } from "ai";
import type { ToolSet } from "ai";
import { z } from "zod";

import { SourceContentStorageError } from "../sources/content-store";
import type { ThinkspaceSourceManifestEntry, ThinkspaceSourceReader } from "../sources/reader";
import type { ActiveAgentProfileRevision } from "./agent-profile";
import { isBuiltInToolId } from "./built-in-tools";
import type { BuiltInToolId } from "./built-in-tools";
import { markThinkspaceTurnProductSafeError } from "./inspect";
import type { ThinkspacePermissionPolicy } from "./permission-policy";
import { isThinkspaceRuntimeCapabilityEnabled, THINKSPACE_RUNTIME_POLICY } from "./runtime-policy";
import type { ThinkspaceRuntimePolicy } from "./runtime-policy";
import { ThinkspaceWebReadError } from "./web-reader";
import type { ThinkspaceWebReader } from "./web-reader";

export const THINKSPACE_BUILT_IN_TOOL_BLOCKED_REASON =
	"This built-in tool is not currently available for this Thinkspace Agent turn.";

const SOURCE_NOT_FOUND_MESSAGE =
	"That Source is not available in this Thinkspace. It may have been deleted. Check the Source manifest for what exists.";
const SOURCE_MANIFEST_UNAVAILABLE_NOTICE =
	"The Source manifest is temporarily unavailable for this turn. Sources may still be readable by id if the user provided one.";
const UNEXPECTED_TOOL_FAILURE_MESSAGE =
	"This tool failed unexpectedly for this turn. Continue with the available context, and mention the limitation briefly if it affects the answer.";

const POLICY_ASSEMBLY_MISMATCH_MESSAGE =
	"This Thinkspace Agent turn was stopped before it started: the runtime safety policy and the assembled tools disagree.";

/**
 * Read failures become tool results, not exceptions: the model sees a clean
 * product-safe sentence and the bounded loop keeps running.
 */
const toProductSafeToolFailure = (error: unknown): string => {
	if (error instanceof ThinkspaceWebReadError || error instanceof SourceContentStorageError) {
		return error.message;
	}

	return UNEXPECTED_TOOL_FAILURE_MESSAGE;
};

export interface PrepareThinkspaceBuiltInRuntimeToolsInput {
	activeProductToolIds: readonly string[];
	sourceReader: ThinkspaceSourceReader;
	webReader: ThinkspaceWebReader;
}

export interface ThinkspaceBuiltInRuntimePreparation {
	activeToolNames: string[];
	/** Appended to the system prompt when Source reading is active. */
	sourceManifestNotice: string | null;
	tools: ToolSet;
}

const formatManifestSize = (sizeBytes: number): string =>
	sizeBytes < 1024 ? `${sizeBytes} B` : `${(sizeBytes / 1024).toFixed(1)} KB`;

export const buildThinkspaceSourceManifest = (
	entries: readonly ThinkspaceSourceManifestEntry[],
): string => {
	if (entries.length === 0) {
		return "This Thinkspace has no Sources yet. The source_read tool will only work once the user uploads material.";
	}

	const lines = entries.map((entry) => {
		const description = entry.description ? ` — ${entry.description}` : "";

		return `- ${entry.id}: "${entry.name}" (${formatManifestSize(entry.sizeBytes)})${description}`;
	});

	return `This Thinkspace has the following Sources, readable with the source_read tool by id:\n${lines.join("\n")}`;
};

const createWebSearchTool = (webReader: ThinkspaceWebReader) =>
	tool({
		description:
			"Search the public web. Read-only. Returns a compact list of results with URLs that can be read with web_fetch.",
		execute: async ({ query }) => {
			try {
				return await webReader.search(query);
			} catch (error) {
				return toProductSafeToolFailure(error);
			}
		},
		inputSchema: z.object({
			query: z.string().min(1).max(400).describe("The web search query."),
		}),
	});

const createWebFetchTool = (webReader: ThinkspaceWebReader) =>
	tool({
		description:
			"Fetch one public web page by http(s) URL and return its content as text. Read-only.",
		execute: async ({ url }) => {
			try {
				return await webReader.fetchPage(url);
			} catch (error) {
				return toProductSafeToolFailure(error);
			}
		},
		inputSchema: z.object({
			url: z.string().min(1).max(2000).describe("The http(s) URL of the page to read."),
		}),
	});

const createSourceReadTool = (sourceReader: ThinkspaceSourceReader) =>
	tool({
		description:
			"Read one of this Thinkspace's Sources by id. The available Sources and their ids are listed in the Source manifest.",
		execute: async ({ sourceId }) => {
			try {
				const document = await sourceReader.read(sourceId);

				if (!document) {
					return SOURCE_NOT_FOUND_MESSAGE;
				}

				return `Source ${document.id}: "${document.name}"\n\n${document.content}`;
			} catch (error) {
				return toProductSafeToolFailure(error);
			}
		},
		inputSchema: z.object({
			sourceId: z.string().min(1).max(200).describe("The Source id from the manifest."),
		}),
	});

const activeBuiltInToolIds = (activeProductToolIds: readonly string[]): BuiltInToolId[] =>
	activeProductToolIds.filter(isBuiltInToolId);

/**
 * Builds the built-in half of the turn's toolset from the active set. The
 * Source manifest is fetched only when Source reading is active; a manifest
 * listing failure degrades into a product-safe notice instead of failing the
 * turn, mirroring the MCP degradation path.
 */
export const prepareThinkspaceBuiltInRuntimeTools = async ({
	activeProductToolIds,
	sourceReader,
	webReader,
}: PrepareThinkspaceBuiltInRuntimeToolsInput): Promise<ThinkspaceBuiltInRuntimePreparation> => {
	const activeToolIds = activeBuiltInToolIds(activeProductToolIds);
	const tools: ToolSet = {};
	let sourceManifestNotice: string | null = null;

	for (const toolId of activeToolIds) {
		if (toolId === "web_search") {
			tools.web_search = createWebSearchTool(webReader);
		}

		if (toolId === "web_fetch") {
			tools.web_fetch = createWebFetchTool(webReader);
		}

		if (toolId === "source_read") {
			tools.source_read = createSourceReadTool(sourceReader);

			try {
				sourceManifestNotice = buildThinkspaceSourceManifest(await sourceReader.listManifest());
			} catch {
				sourceManifestNotice = SOURCE_MANIFEST_UNAVAILABLE_NOTICE;
			}
		}
	}

	return {
		activeToolNames: Object.keys(tools),
		sourceManifestNotice,
		tools,
	};
};

/**
 * The zero-blast-radius guarantee must survive bugs (PRD #73): if assembly
 * produced an active built-in tool while the runtime policy has the
 * capability disabled, or workspace bash is not forced off, the turn fails
 * product-safely before any inference happens.
 */
export const assertThinkspaceRuntimePolicySupportsBuiltInTools = ({
	activeProductToolIds,
	policy = THINKSPACE_RUNTIME_POLICY,
}: {
	activeProductToolIds: readonly string[];
	policy?: ThinkspaceRuntimePolicy;
}): void => {
	if (policy.workspaceBash !== false) {
		throw new Error(markThinkspaceTurnProductSafeError(POLICY_ASSEMBLY_MISMATCH_MESSAGE));
	}

	if (
		activeBuiltInToolIds(activeProductToolIds).length > 0 &&
		!isThinkspaceRuntimeCapabilityEnabled(policy, "builtin_read_tools")
	) {
		throw new Error(markThinkspaceTurnProductSafeError(POLICY_ASSEMBLY_MISMATCH_MESSAGE));
	}
};

export interface ThinkspaceBuiltInToolCallDecision {
	allowed: boolean;
	applies: boolean;
	reason?: string;
	toolId: BuiltInToolId | null;
}

/**
 * Defense in depth at the call boundary, mirroring the MCP enforcement: a
 * built-in tool call is allowed only while its enablement is still potent.
 * Tools outside the built-in catalog are not this evaluator's concern.
 */
export const evaluateBuiltInRuntimeToolCallPermission = async ({
	permissionPolicy,
	revision,
	runtimeToolName,
	thinkspaceId,
}: {
	permissionPolicy: ThinkspacePermissionPolicy;
	revision: ActiveAgentProfileRevision;
	runtimeToolName: string;
	thinkspaceId: string;
}): Promise<ThinkspaceBuiltInToolCallDecision> => {
	if (!isBuiltInToolId(runtimeToolName)) {
		return { allowed: true, applies: false, toolId: null };
	}

	const enablements = revision.toolEnablements.filter(
		(enablement) => enablement.source === "built_in" && enablement.toolId === runtimeToolName,
	);

	if (enablements.length === 0) {
		return {
			allowed: false,
			applies: true,
			reason: THINKSPACE_BUILT_IN_TOOL_BLOCKED_REASON,
			toolId: runtimeToolName,
		};
	}

	const verdicts = await permissionPolicy.evaluateToolPotency({ enablements, thinkspaceId });
	const allowed = verdicts.some((verdict) => verdict.potency === "potent");

	return {
		allowed,
		applies: true,
		reason: allowed ? undefined : THINKSPACE_BUILT_IN_TOOL_BLOCKED_REASON,
		toolId: runtimeToolName,
	};
};
