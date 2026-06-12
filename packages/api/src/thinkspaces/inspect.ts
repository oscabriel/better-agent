import type { ProductDb } from "@better-agent/db";
import type { Thinkspace } from "@better-agent/db/schema/thinkspaces";
import type { CloudflareEnv } from "@better-agent/env/types";

import type { BuiltInMcpServer } from "../mcp/catalog";
import { listBuiltInMcpServers } from "../mcp/catalog";
import { parseCloudflareAgentsMcpToolName } from "../mcp/tool-identity";
import { isBuiltInToolId, parseBuiltInSourceReadResultName } from "./built-in-tools";
import type { BuiltInToolId } from "./built-in-tools";
import { getThinkspace } from "./repository";
import { resolveThinkspaceAgentRuntime, THINKSPACE_AGENT_BINDING_NAME } from "./runtime";
import { THINKSPACE_TURN_SOURCE, ThinkspaceTurnValidationError } from "./turns";

export const THINKSPACE_TURN_SUBMISSION_ID_MAX_LENGTH = 128;
export const THINKSPACE_TURN_RESULT_TEXT_MAX_LENGTH = 8000;
export const THINKSPACE_TURN_TOOL_ACTIVITY_MAX_ENTRIES = 32;
export const THINKSPACE_TURN_TOOL_ACTIVITY_ENTRY_MAX_LENGTH = 300;

/**
 * Marker prefix for failure messages the Thinkspace Agent runtime throws on
 * purpose for the product surface. Inspection strips the marker and shows the
 * message; any unmarked runtime/provider error is replaced with a generic
 * product-safe message so secrets and raw internals never reach the product.
 */
const PRODUCT_SAFE_ERROR_MARKER = "thinkspace-turn-product-safe:";

const UNKNOWN_TURN_MESSAGE =
	"This Thinkspace Agent turn is not known to this Thinkspace. Check the submission handle and try again.";
const ACCEPTED_TURN_MESSAGE =
	"Accepted. This Thinkspace Agent turn is waiting for the runtime to start it.";
const RUNNING_TURN_MESSAGE = "This Thinkspace Agent turn is running.";
const COMPLETED_TURN_MESSAGE =
	"Completed. Showing the Thinkspace Agent's latest model-only response.";
const COMPLETED_WITHOUT_TEXT_MESSAGE =
	"Completed. The Thinkspace Agent did not return any text for this turn.";
const GENERIC_FAILED_TURN_MESSAGE =
	"This Thinkspace Agent turn failed before completing. Provider and runtime details are not shown here.";
const ABORTED_TURN_MESSAGE = "This Thinkspace Agent turn was stopped before completing.";
const SKIPPED_TURN_MESSAGE =
	"This Thinkspace Agent turn was skipped before running. Submit the turn again.";

export type ThinkspaceRuntimeSubmissionStatus =
	| "pending"
	| "running"
	| "completed"
	| "aborted"
	| "skipped"
	| "error";

/**
 * Structural snapshot of a runtime submission row. Mirrors what the
 * Thinkspace Agent runtime can read for a submission without importing
 * runtime SDK types into this transport-free package.
 */
export interface ThinkspaceRuntimeSubmissionSnapshot {
	completedAt?: number;
	createdAt: number;
	error?: string;
	idempotencyKey?: string;
	metadata?: Record<string, unknown>;
	startedAt?: number;
	status: ThinkspaceRuntimeSubmissionStatus;
	submissionId: string;
}

export interface ThinkspaceRuntimeMessagePart {
	input?: unknown;
	output?: unknown;
	state?: string;
	text?: string;
	toolName?: string;
	type: string;
}

export interface ThinkspaceRuntimeMessage {
	parts: readonly ThinkspaceRuntimeMessagePart[];
	role: string;
}

export type ThinkspaceTurnInspectionStatus =
	| "accepted"
	| "running"
	| "completed"
	| "failed"
	| "unknown";

export interface ThinkspaceTurnInspection {
	acceptedAt: number | null;
	completedAt: number | null;
	message: string;
	resultText: string | null;
	profileRevisionId: string | null;
	profileVersion: number | null;
	startedAt: number | null;
	status: ThinkspaceTurnInspectionStatus;
	submissionId: string;
	thinkspaceId: string;
	toolActivity: readonly string[];
}

export interface ThinkspaceTurnInspectionRequest {
	submissionId: string;
	thinkspaceId: string;
}

export interface InspectOwnedThinkspaceTurnInput {
	db: ProductDb;
	env: ThinkspaceTurnInspectEnv;
	getThinkspaceByOwner?: GetThinkspaceByOwner;
	inspectTurnSubmission?: InspectTurnSubmission;
	ownerUserId: string;
	submissionId: string;
	thinkspaceId: string;
}

type ThinkspaceTurnInspectEnv = Pick<CloudflareEnv, typeof THINKSPACE_AGENT_BINDING_NAME>;

type GetThinkspaceByOwner = (
	db: ProductDb,
	input: { ownerUserId: string; thinkspaceId: string },
) => Promise<Pick<Thinkspace, "id"> | null>;

type InspectTurnSubmission = (input: {
	env: ThinkspaceTurnInspectEnv;
	request: ThinkspaceTurnInspectionRequest;
	runtimeName: string;
}) => Promise<ThinkspaceTurnInspection>;

interface ThinkspaceAgentInspectStub {
	inspectTurnSubmission: (
		request: ThinkspaceTurnInspectionRequest,
	) => Promise<ThinkspaceTurnInspection>;
	/**
	 * PartyServer's initialization RPC. User-defined RPC methods do not pass
	 * through the runtime's fetch/alarm entry points where `onStart()` would
	 * run, so the runtime must be initialized explicitly before the turn RPC
	 * (the same synchronization `getServerByName()` performs).
	 */
	setName: (name: string) => Promise<void>;
}

export const validateThinkspaceTurnSubmissionId = (submissionId: string): string => {
	const bounded = submissionId.trim();

	if (!bounded) {
		throw new ThinkspaceTurnValidationError(
			"Inspecting a Thinkspace Agent turn needs a non-empty submission handle.",
		);
	}

	if (bounded.length > THINKSPACE_TURN_SUBMISSION_ID_MAX_LENGTH) {
		throw new ThinkspaceTurnValidationError(
			`A Thinkspace Agent turn submission handle is limited to ${THINKSPACE_TURN_SUBMISSION_ID_MAX_LENGTH} characters.`,
		);
	}

	return bounded;
};

export const markThinkspaceTurnProductSafeError = (message: string): string =>
	message.startsWith(PRODUCT_SAFE_ERROR_MARKER)
		? message
		: `${PRODUCT_SAFE_ERROR_MARKER}${message}`;

export const extractThinkspaceTurnProductSafeFailureMessage = (error?: string): string => {
	if (!error?.startsWith(PRODUCT_SAFE_ERROR_MARKER)) {
		return GENERIC_FAILED_TURN_MESSAGE;
	}

	const message = error.slice(PRODUCT_SAFE_ERROR_MARKER.length).trim();

	return message || GENERIC_FAILED_TURN_MESSAGE;
};

/** Bounds a product-surface string with a trailing ellipsis when it overflows. */
const boundForRendering = (text: string, maxLength: number): string =>
	text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;

export const extractThinkspaceTurnResultText = (
	messages: readonly ThinkspaceRuntimeMessage[],
): string | null => {
	const lastAssistantMessage = messages.findLast((message) => message.role === "assistant");

	if (!lastAssistantMessage) {
		return null;
	}

	const resultText = lastAssistantMessage.parts
		.filter((part) => part.type === "text" && typeof part.text === "string")
		.map((part) => part.text)
		.join("")
		.trim();

	if (!resultText) {
		return null;
	}

	return boundForRendering(resultText, THINKSPACE_TURN_RESULT_TEXT_MAX_LENGTH);
};

const TOOL_PART_TYPE_PREFIX = "tool-";
const DYNAMIC_TOOL_PART_TYPE = "dynamic-tool";
const INCOMPLETE_TOOL_CALL_SUFFIX = " (did not complete)";
const GENERIC_TOOL_ACTIVITY_MESSAGE = "Used another tool for this turn.";

const runtimeToolNameFromMessagePart = (part: ThinkspaceRuntimeMessagePart): string | null => {
	if (part.type === DYNAMIC_TOOL_PART_TYPE) {
		return typeof part.toolName === "string" && part.toolName ? part.toolName : null;
	}

	if (part.type.startsWith(TOOL_PART_TYPE_PREFIX)) {
		const toolName = part.type.slice(TOOL_PART_TYPE_PREFIX.length);

		return toolName || null;
	}

	return null;
};

const toolInputField = (input: unknown, field: string): string | null => {
	if (typeof input !== "object" || input === null) {
		return null;
	}

	const value = (input as Record<string, unknown>)[field];

	return typeof value === "string" && value.trim() ? value.trim() : null;
};

const describeWebSearchActivity = (part: ThinkspaceRuntimeMessagePart): string => {
	const query = toolInputField(part.input, "query");

	return query ? `Searched the web for "${query}".` : "Searched the web.";
};

const describeWebFetchActivity = (part: ThinkspaceRuntimeMessagePart): string => {
	const url = toolInputField(part.input, "url");

	return url ? `Fetched the web page ${url}.` : "Fetched a web page.";
};

const describeSourceReadActivity = (part: ThinkspaceRuntimeMessagePart): string => {
	const sourceName =
		typeof part.output === "string" ? parseBuiltInSourceReadResultName(part.output) : null;

	if (sourceName) {
		return `Read the Source "${sourceName}".`;
	}

	const sourceId = toolInputField(part.input, "sourceId");

	return sourceId ? `Tried to read Source ${sourceId}.` : "Tried to read a Source.";
};

const describeMcpToolActivity = (
	runtimeToolName: string,
	builtInMcpServers: readonly BuiltInMcpServer[],
): string | null => {
	const identity = parseCloudflareAgentsMcpToolName(
		runtimeToolName,
		builtInMcpServers.map((server) => server.id),
	);

	if (!identity) {
		return null;
	}

	const server = builtInMcpServers.find((candidate) => candidate.id === identity.serverId);
	const serverName = server?.name ?? identity.serverId;

	return `Used the ${serverName} external information source: ${identity.toolName}.`;
};

const describeBuiltInToolActivity = (
	toolId: BuiltInToolId,
	part: ThinkspaceRuntimeMessagePart,
): string => {
	switch (toolId) {
		case "web_search": {
			return describeWebSearchActivity(part);
		}
		case "web_fetch": {
			return describeWebFetchActivity(part);
		}
		case "source_read": {
			return describeSourceReadActivity(part);
		}
		default: {
			return GENERIC_TOOL_ACTIVITY_MESSAGE;
		}
	}
};

const describeToolActivity = (
	part: ThinkspaceRuntimeMessagePart,
	builtInMcpServers: readonly BuiltInMcpServer[],
): string | null => {
	const runtimeToolName = runtimeToolNameFromMessagePart(part);

	if (!runtimeToolName) {
		return null;
	}

	if (isBuiltInToolId(runtimeToolName)) {
		return describeBuiltInToolActivity(runtimeToolName, part);
	}

	return (
		describeMcpToolActivity(runtimeToolName, builtInMcpServers) ?? GENERIC_TOOL_ACTIVITY_MESSAGE
	);
};

/**
 * Renders the latest assistant message's tool calls as a bounded list of
 * product-language lines — Sources read by name, searches by query, fetches
 * by URL, external information sources by their catalog name. Raw runtime
 * payloads and tool outputs never pass through; tools outside the known
 * catalogs render generically.
 */
export const extractThinkspaceTurnToolActivity = (
	messages: readonly ThinkspaceRuntimeMessage[],
	builtInMcpServers: readonly BuiltInMcpServer[] = listBuiltInMcpServers(),
): string[] => {
	const lastAssistantMessage = messages.findLast((message) => message.role === "assistant");

	if (!lastAssistantMessage) {
		return [];
	}

	const activity: string[] = [];

	for (const part of lastAssistantMessage.parts) {
		if (activity.length >= THINKSPACE_TURN_TOOL_ACTIVITY_MAX_ENTRIES) {
			break;
		}

		const description = describeToolActivity(part, builtInMcpServers);

		if (!description) {
			continue;
		}

		// Bound the description with the suffix's length reserved so a long
		// entry never silently sheds its did-not-complete marker.
		const suffix = part.state === "output-error" ? INCOMPLETE_TOOL_CALL_SUFFIX : "";
		const bounded = boundForRendering(
			description,
			THINKSPACE_TURN_TOOL_ACTIVITY_ENTRY_MAX_LENGTH - suffix.length,
		);

		activity.push(`${bounded}${suffix}`);
	}

	return activity;
};

const createUnknownTurnInspection = (
	submissionId: string,
	thinkspaceId: string,
): ThinkspaceTurnInspection => ({
	acceptedAt: null,
	completedAt: null,
	message: UNKNOWN_TURN_MESSAGE,
	profileRevisionId: null,
	profileVersion: null,
	resultText: null,
	startedAt: null,
	status: "unknown",
	submissionId,
	thinkspaceId,
	toolActivity: [],
});

const createFailureMessage = (snapshot: ThinkspaceRuntimeSubmissionSnapshot): string => {
	if (snapshot.status === "aborted") {
		return ABORTED_TURN_MESSAGE;
	}

	if (snapshot.status === "skipped") {
		return SKIPPED_TURN_MESSAGE;
	}

	return extractThinkspaceTurnProductSafeFailureMessage(snapshot.error);
};

export const mapThinkspaceTurnInspection = ({
	resultText = null,
	snapshot,
	submissionId,
	thinkspaceId,
	toolActivity = [],
}: {
	resultText?: string | null;
	snapshot: ThinkspaceRuntimeSubmissionSnapshot | null;
	submissionId: string;
	thinkspaceId: string;
	toolActivity?: readonly string[];
}): ThinkspaceTurnInspection => {
	if (
		!snapshot ||
		snapshot.metadata?.thinkspaceId !== thinkspaceId ||
		snapshot.metadata?.source !== THINKSPACE_TURN_SOURCE
	) {
		return createUnknownTurnInspection(submissionId, thinkspaceId);
	}

	const base = {
		acceptedAt: snapshot.createdAt,
		completedAt: snapshot.completedAt ?? null,
		profileRevisionId:
			typeof snapshot.metadata.profileRevisionId === "string"
				? snapshot.metadata.profileRevisionId
				: null,
		profileVersion:
			typeof snapshot.metadata.profileVersion === "number"
				? snapshot.metadata.profileVersion
				: null,
		resultText: null,
		startedAt: snapshot.startedAt ?? null,
		submissionId: snapshot.submissionId,
		thinkspaceId,
		toolActivity: [] as readonly string[],
	};

	if (snapshot.status === "pending") {
		return { ...base, message: ACCEPTED_TURN_MESSAGE, status: "accepted" };
	}

	if (snapshot.status === "running") {
		return { ...base, message: RUNNING_TURN_MESSAGE, status: "running" };
	}

	if (snapshot.status === "completed") {
		return {
			...base,
			message: resultText ? COMPLETED_TURN_MESSAGE : COMPLETED_WITHOUT_TEXT_MESSAGE,
			resultText,
			status: "completed",
			toolActivity,
		};
	}

	return { ...base, message: createFailureMessage(snapshot), status: "failed" };
};

const inspectViaThinkspaceAgentRuntime: InspectTurnSubmission = async ({
	env,
	request,
	runtimeName,
}) => {
	const namespace = env[THINKSPACE_AGENT_BINDING_NAME];
	const stub = namespace.get(
		namespace.idFromName(runtimeName),
	) as unknown as ThinkspaceAgentInspectStub;

	await stub.setName(runtimeName);

	return await stub.inspectTurnSubmission(request);
};

export const inspectOwnedThinkspaceTurn = async ({
	db,
	env,
	getThinkspaceByOwner = getThinkspace,
	inspectTurnSubmission = inspectViaThinkspaceAgentRuntime,
	ownerUserId,
	submissionId,
	thinkspaceId,
}: InspectOwnedThinkspaceTurnInput): Promise<ThinkspaceTurnInspection | null> => {
	const boundedSubmissionId = validateThinkspaceTurnSubmissionId(submissionId);

	const thinkspace = await getThinkspaceByOwner(db, { ownerUserId, thinkspaceId });

	if (!thinkspace) {
		return null;
	}

	const runtime = resolveThinkspaceAgentRuntime({ env, thinkspaceId: thinkspace.id });

	return await inspectTurnSubmission({
		env,
		request: {
			submissionId: boundedSubmissionId,
			thinkspaceId: thinkspace.id,
		},
		runtimeName: runtime.runtimeName,
	});
};
