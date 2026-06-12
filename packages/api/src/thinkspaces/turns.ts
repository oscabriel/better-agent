import type { ProductDb } from "@better-agent/db";
import type { Thinkspace } from "@better-agent/db/schema/thinkspaces";
import type { CloudflareEnv } from "@better-agent/env/types";

import {
	checkThinkspaceModelReadiness,
	ThinkspaceTurnModelUnavailableError,
} from "../models/readiness";
import type {
	CheckThinkspaceModelReadinessInput,
	ThinkspaceModelReadiness,
} from "../models/readiness";
import type { ModelCatalog } from "../models/model-catalog";
import type { ActiveAgentProfileRevision } from "./agent-profile";
import { getActiveAgentProfileRevision } from "./agent-profile-repository";
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
	profileRevisionId: string;
	profileVersion: number;
}

export interface ThinkspaceTurnAcceptance {
	acceptedAt: number;
	deduplicated: boolean;
	idempotencyKey: string;
	status: "accepted";
	submissionId: string;
	thinkspaceId: string;
	profileRevisionId: string;
	profileVersion: number;
}

export interface SubmitOwnedThinkspaceTurnInput {
	acceptTurnSubmission?: AcceptTurnSubmission;
	checkModelReadiness?: CheckModelReadiness;
	db: ProductDb;
	env: ThinkspaceTurnEnv;
	getThinkspaceByOwner?: GetThinkspaceByOwner;
	getActiveRevision?: GetActiveRevision;
	idempotencyKey: string;
	instruction: string;
	modelCatalog?: ModelCatalog;
	ownerUserId: string;
	thinkspaceId: string;
}

type ThinkspaceTurnEnv = Pick<
	CloudflareEnv,
	| "API_ENCRYPTION_KEY"
	| "BETTER_AUTH_SECRET"
	| "MODEL_CATALOG_KV"
	| typeof THINKSPACE_AGENT_BINDING_NAME
>;

type GetThinkspaceByOwner = (
	db: ProductDb,
	input: { ownerUserId: string; thinkspaceId: string },
) => Promise<Pick<Thinkspace, "id" | "status"> | null>;

type GetActiveRevision = (
	db: ProductDb,
	input: { thinkspaceId: string },
) => Promise<ActiveAgentProfileRevision | null>;

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
	/**
	 * PartyServer's initialization RPC. User-defined RPC methods do not pass
	 * through the runtime's fetch/alarm entry points where `onStart()` would
	 * run, so the runtime must be initialized explicitly before the turn RPC
	 * (the same synchronization `getServerByName()` performs).
	 */
	setName: (name: string) => Promise<void>;
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

	await stub.setName(runtimeName);

	return await stub.acceptTurnSubmission(request);
};

export const submitOwnedThinkspaceTurn = async ({
	acceptTurnSubmission = acceptViaThinkspaceAgentRuntime,
	checkModelReadiness = checkThinkspaceModelReadiness,
	db,
	env,
	getActiveRevision = getActiveAgentProfileRevision,
	getThinkspaceByOwner = getThinkspace,
	idempotencyKey,
	instruction,
	modelCatalog,
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

	const activeRevision = await getActiveRevision(db, { thinkspaceId: thinkspace.id });

	const readiness = await checkModelReadiness({
		db,
		env,
		modelBehavior: activeRevision?.modelBehavior,
		modelCatalog,
		settings: null,
		thinkspace,
		userId: ownerUserId,
	});

	if (!activeRevision) {
		throw new ThinkspaceTurnModelUnavailableError({
			message: "Activate an Agent Profile revision before running this Thinkspace Agent.",
			modelId: readiness.modelId,
			reason: "no_active_agent_profile_revision",
			reasoningEffort: readiness.reasoningEffort,
			status: "not_ready",
		});
	}

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
			profileRevisionId: activeRevision.id,
			profileVersion: activeRevision.version,
			thinkspaceId: thinkspace.id,
		},
		runtimeName: runtime.runtimeName,
	});
};
