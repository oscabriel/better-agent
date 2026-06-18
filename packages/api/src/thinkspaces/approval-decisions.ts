import type { ProductDb } from "@better-agent/db";
import type { Thinkspace } from "@better-agent/db/schema/thinkspaces";
import type { CloudflareEnv } from "@better-agent/env/types";

import type { ThinkspaceApprovalDecision } from "./approvals";
import { getThinkspace } from "./repository";
import { resolveThinkspaceAgentRuntime, THINKSPACE_AGENT_BINDING_NAME } from "./runtime";

export const THINKSPACE_APPROVAL_ID_MAX_LENGTH = 128;

/**
 * The worker→runtime contract for deciding one pending Approval out-of-band.
 * Deciding drives the Durable Object (which owns the parked-turn state); the
 * Review Queue reads the D1 index. Mirrors the submit/inspect runtime contracts
 * in turns.ts and inspect.ts.
 */
export interface ThinkspaceMemoryApprovalDecisionRequest {
	approvalId: string;
	decision: ThinkspaceApprovalDecision;
	ownerUserId: string;
	reason?: string;
	thinkspaceId: string;
}

export type ThinkspaceMemoryApprovalDecisionStatus = "applied" | "not_found";

export interface ThinkspaceMemoryApprovalDecisionResult {
	approvalId: string;
	decision: ThinkspaceApprovalDecision;
	status: ThinkspaceMemoryApprovalDecisionStatus;
	thinkspaceId: string;
}

export class ThinkspaceApprovalValidationError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "ThinkspaceApprovalValidationError";
	}
}

export const validateThinkspaceApprovalId = (approvalId: string): string => {
	const bounded = approvalId.trim();

	if (!bounded) {
		throw new ThinkspaceApprovalValidationError("Deciding an Approval needs a non-empty handle.");
	}

	if (bounded.length > THINKSPACE_APPROVAL_ID_MAX_LENGTH) {
		throw new ThinkspaceApprovalValidationError(
			`An Approval handle is limited to ${THINKSPACE_APPROVAL_ID_MAX_LENGTH} characters.`,
		);
	}

	return bounded;
};

type ThinkspaceApprovalDecisionEnv = Pick<CloudflareEnv, typeof THINKSPACE_AGENT_BINDING_NAME>;

type GetThinkspaceByOwner = (
	db: ProductDb,
	input: { ownerUserId: string; thinkspaceId: string },
) => Promise<Pick<Thinkspace, "id"> | null>;

type DecideApproval = (input: {
	env: ThinkspaceApprovalDecisionEnv;
	request: ThinkspaceMemoryApprovalDecisionRequest;
	runtimeName: string;
}) => Promise<ThinkspaceMemoryApprovalDecisionResult>;

interface ThinkspaceAgentApprovalStub {
	decideMemoryApproval: (
		request: ThinkspaceMemoryApprovalDecisionRequest,
	) => Promise<ThinkspaceMemoryApprovalDecisionResult>;
	/**
	 * PartyServer's initialization RPC. User-defined RPC methods do not pass
	 * through the runtime's fetch/alarm entry points where `onStart()` would run,
	 * so the runtime must be initialized explicitly before the decision RPC.
	 */
	setName: (name: string) => Promise<void>;
}

const decideViaThinkspaceAgentRuntime: DecideApproval = async ({ env, request, runtimeName }) => {
	const namespace = env[THINKSPACE_AGENT_BINDING_NAME];
	const stub = namespace.get(
		namespace.idFromName(runtimeName),
	) as unknown as ThinkspaceAgentApprovalStub;

	await stub.setName(runtimeName);

	return await stub.decideMemoryApproval(request);
};

export interface DecideOwnedThinkspaceMemoryApprovalInput {
	approvalId: string;
	db: ProductDb;
	decideApproval?: DecideApproval;
	decision: ThinkspaceApprovalDecision;
	env: ThinkspaceApprovalDecisionEnv;
	getThinkspaceByOwner?: GetThinkspaceByOwner;
	ownerUserId: string;
	reason?: string;
	thinkspaceId: string;
}

/**
 * Owner-gated decide: hides another user's Thinkspace (and therefore its
 * Approvals) behind the same null-return the rest of the control plane maps to
 * 404. Returns null when the Thinkspace is not the caller's; otherwise drives
 * the runtime, which is authoritative over whether the specific Approval is
 * still pending.
 */
export const decideOwnedThinkspaceMemoryApproval = async ({
	approvalId,
	db,
	decideApproval = decideViaThinkspaceAgentRuntime,
	decision,
	env,
	getThinkspaceByOwner = getThinkspace,
	ownerUserId,
	reason,
	thinkspaceId,
}: DecideOwnedThinkspaceMemoryApprovalInput): Promise<ThinkspaceMemoryApprovalDecisionResult | null> => {
	const boundedApprovalId = validateThinkspaceApprovalId(approvalId);

	const thinkspace = await getThinkspaceByOwner(db, { ownerUserId, thinkspaceId });

	if (!thinkspace) {
		return null;
	}

	const runtime = resolveThinkspaceAgentRuntime({ env, thinkspaceId: thinkspace.id });

	return await decideApproval({
		env,
		request: {
			approvalId: boundedApprovalId,
			decision,
			ownerUserId,
			reason,
			thinkspaceId: thinkspace.id,
		},
		runtimeName: runtime.runtimeName,
	});
};
