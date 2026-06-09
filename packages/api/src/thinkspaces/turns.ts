import type { ProductDb } from "@better-agent/db";
import type { Thinkspace } from "@better-agent/db/schema/thinkspaces";
import type { CloudflareEnv } from "@better-agent/env/types";

import {
	checkThinkspaceModelReadiness,
	getUserProductModelSettings,
	ThinkspaceTurnModelUnavailableError,
} from "../models/readiness";
import type {
	CheckThinkspaceModelReadinessInput,
	ThinkspaceModelReadiness,
} from "../models/readiness";
import { getThinkspace } from "./repository";
import { resolveThinkspaceAgentRuntime, THINKSPACE_AGENT_BINDING_NAME } from "./runtime";

export const THINKSPACE_TURN_INSTRUCTION_MAX_LENGTH = 4000;
export const THINKSPACE_TURN_IDEMPOTENCY_KEY_MAX_LENGTH = 128;
export const THINKSPACE_TURN_SOURCE = "better-agent" as const;

export interface ThinkspaceTurnSubmissionRequest {
	idempotencyKey: string;
	instruction: string;
	ownerUserId: string;
	thinkspaceId: string;
}

export interface ThinkspaceTurnAcceptance {
	acceptedAt: number;
	deduplicated: boolean;
	idempotencyKey: string;
	status: "accepted";
	submissionId: string;
	thinkspaceId: string;
}

export interface SubmitOwnedThinkspaceTurnInput {
	acceptTurnSubmission?: AcceptTurnSubmission;
	checkModelReadiness?: CheckModelReadiness;
	db: ProductDb;
	env: ThinkspaceTurnEnv;
	getThinkspaceByOwner?: GetThinkspaceByOwner;
	getUserSettings?: GetUserSettings;
	idempotencyKey: string;
	instruction: string;
	ownerUserId: string;
	thinkspaceId: string;
}

type ThinkspaceTurnEnv = Pick<
	CloudflareEnv,
	| "ANTHROPIC_API_KEY"
	| "API_ENCRYPTION_KEY"
	| "BETTER_AUTH_SECRET"
	| "GOOGLE_GENERATIVE_AI_API_KEY"
	| "OPENAI_API_KEY"
	| typeof THINKSPACE_AGENT_BINDING_NAME
>;

type GetThinkspaceByOwner = (
	db: ProductDb,
	input: { ownerUserId: string; thinkspaceId: string },
) => Promise<Pick<Thinkspace, "id" | "requestedPermissions" | "status"> | null>;

type GetUserSettings = typeof getUserProductModelSettings;

type CheckModelReadiness = (
	input: CheckThinkspaceModelReadinessInput,
) => Promise<ThinkspaceModelReadiness>;

type AcceptTurnSubmission = (input: {
	env: ThinkspaceTurnEnv;
	request: ThinkspaceTurnSubmissionRequest;
	runtimeName: string;
}) => Promise<ThinkspaceTurnAcceptance>;

interface ThinkspaceAgentTurnStub {
	acceptTurnSubmission: (
		request: ThinkspaceTurnSubmissionRequest,
	) => Promise<ThinkspaceTurnAcceptance>;
}

export class ThinkspaceTurnValidationError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "ThinkspaceTurnValidationError";
	}
}

export const validateThinkspaceTurnInstruction = (instruction: string): string => {
	const bounded = instruction.trim();

	if (!bounded) {
		throw new ThinkspaceTurnValidationError(
			"A Thinkspace Agent turn needs a non-empty instruction.",
		);
	}

	if (bounded.length > THINKSPACE_TURN_INSTRUCTION_MAX_LENGTH) {
		throw new ThinkspaceTurnValidationError(
			`A Thinkspace Agent turn instruction is limited to ${THINKSPACE_TURN_INSTRUCTION_MAX_LENGTH} characters.`,
		);
	}

	return bounded;
};

export const validateThinkspaceTurnIdempotencyKey = (idempotencyKey: string): string => {
	const bounded = idempotencyKey.trim();

	if (!bounded) {
		throw new ThinkspaceTurnValidationError(
			"A Thinkspace Agent turn needs a non-empty idempotency key.",
		);
	}

	if (bounded.length > THINKSPACE_TURN_IDEMPOTENCY_KEY_MAX_LENGTH) {
		throw new ThinkspaceTurnValidationError(
			`A Thinkspace Agent turn idempotency key is limited to ${THINKSPACE_TURN_IDEMPOTENCY_KEY_MAX_LENGTH} characters.`,
		);
	}

	return bounded;
};

const acceptViaThinkspaceAgentRuntime: AcceptTurnSubmission = async ({
	env,
	request,
	runtimeName,
}) => {
	const namespace = env[THINKSPACE_AGENT_BINDING_NAME];
	const stub = namespace.get(
		namespace.idFromName(runtimeName),
	) as unknown as ThinkspaceAgentTurnStub;

	return await stub.acceptTurnSubmission(request);
};

export const submitOwnedThinkspaceTurn = async ({
	acceptTurnSubmission = acceptViaThinkspaceAgentRuntime,
	checkModelReadiness = checkThinkspaceModelReadiness,
	db,
	env,
	getThinkspaceByOwner = getThinkspace,
	getUserSettings = getUserProductModelSettings,
	idempotencyKey,
	instruction,
	ownerUserId,
	thinkspaceId,
}: SubmitOwnedThinkspaceTurnInput): Promise<ThinkspaceTurnAcceptance | null> => {
	const boundedInstruction = validateThinkspaceTurnInstruction(instruction);
	const boundedIdempotencyKey = validateThinkspaceTurnIdempotencyKey(idempotencyKey);

	const thinkspace = await getThinkspaceByOwner(db, { ownerUserId, thinkspaceId });

	if (!thinkspace) {
		return null;
	}

	if (thinkspace.status === "archived") {
		throw new ThinkspaceTurnValidationError(
			"Archived Thinkspaces cannot accept new Thinkspace Agent turns.",
		);
	}

	const readiness = await checkModelReadiness({
		db,
		env,
		settings: await getUserSettings(db, ownerUserId),
		thinkspace,
		userId: ownerUserId,
	});

	if (readiness.status !== "ready") {
		throw new ThinkspaceTurnModelUnavailableError(readiness);
	}

	const runtime = resolveThinkspaceAgentRuntime({ env, thinkspaceId: thinkspace.id });

	return await acceptTurnSubmission({
		env,
		request: {
			idempotencyKey: boundedIdempotencyKey,
			instruction: boundedInstruction,
			ownerUserId,
			thinkspaceId: thinkspace.id,
		},
		runtimeName: runtime.runtimeName,
	});
};
