import type { ProductDb } from "@better-agent/db";
import type { Thinkspace } from "@better-agent/db/schema/thinkspaces";
import type { CloudflareEnv } from "@better-agent/env/types";

import { getThinkspace } from "./repository";
import { resolveThinkspaceAgentRuntime, THINKSPACE_AGENT_BINDING_NAME } from "./runtime";
import { THINKSPACE_TURN_SOURCE, ThinkspaceTurnValidationError } from "./turns";

export const THINKSPACE_TURN_SUBMISSION_ID_MAX_LENGTH = 128;
export const THINKSPACE_TURN_RESULT_TEXT_MAX_LENGTH = 8000;

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
	text?: string;
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

	if (resultText.length > THINKSPACE_TURN_RESULT_TEXT_MAX_LENGTH) {
		return `${resultText.slice(0, THINKSPACE_TURN_RESULT_TEXT_MAX_LENGTH - 1)}…`;
	}

	return resultText;
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
}: {
	resultText?: string | null;
	snapshot: ThinkspaceRuntimeSubmissionSnapshot | null;
	submissionId: string;
	thinkspaceId: string;
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
