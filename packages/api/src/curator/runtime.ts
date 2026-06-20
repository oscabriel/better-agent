import type { ProductDb } from "@better-agent/db";
import type { Thinkspace } from "@better-agent/db/schema/thinkspaces";
import type { CloudflareEnv } from "@better-agent/env/types";

import { getThinkspace } from "../thinkspaces/repository";

export const CURATOR_AGENT_BINDING_NAME = "CURATOR_AGENT" as const;
export const CURATOR_AGENT_CLASS_NAME = "CuratorAgent" as const;

/**
 * Conservative ceiling on the Curator's per-turn agentic loop. The creation
 * conversation is propose-only; this slice ships no mutation tools (#127 adds
 * `set_*`/`enable_tool`), so the bound stays small and the loop never runs away.
 */
export const CURATOR_RUNTIME_MAX_STEPS = 8 as const;

export interface CuratorAgentRuntimeReadiness {
	bindingName: typeof CURATOR_AGENT_BINDING_NAME;
	className: typeof CURATOR_AGENT_CLASS_NAME;
	draftThinkspaceId: string;
	runtimeId: string;
	runtimeName: string;
	status: "ready";
}

export interface ResolveCuratorAgentRuntimeInput {
	draftThinkspaceId: string;
	env: Pick<CloudflareEnv, typeof CURATOR_AGENT_BINDING_NAME>;
}

export interface GetOwnedCuratorAgentRuntimeReadinessInput extends ResolveCuratorAgentRuntimeInput {
	db: ProductDb;
	getThinkspaceByOwner?: GetThinkspaceByOwner;
	ownerUserId: string;
}

type GetThinkspaceByOwner = (
	db: ProductDb,
	input: { ownerUserId: string; thinkspaceId: string },
) => Promise<Pick<Thinkspace, "id"> | null>;

export class CuratorRuntimeResolutionError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "CuratorRuntimeResolutionError";
	}
}

export const getCuratorAgentRuntimeName = (draftThinkspaceId: string): string => {
	const runtimeName = draftThinkspaceId.trim();

	if (!runtimeName) {
		throw new CuratorRuntimeResolutionError(
			"Curator runtime identity requires a draft Thinkspace id.",
		);
	}

	return runtimeName;
};

export const resolveCuratorAgentRuntime = ({
	draftThinkspaceId,
	env,
}: ResolveCuratorAgentRuntimeInput): CuratorAgentRuntimeReadiness => {
	const namespace = env[CURATOR_AGENT_BINDING_NAME];

	if (!namespace) {
		throw new CuratorRuntimeResolutionError("Curator runtime binding is not available.");
	}

	const runtimeName = getCuratorAgentRuntimeName(draftThinkspaceId);
	const runtimeId = namespace.idFromName(runtimeName).toString();

	return {
		bindingName: CURATOR_AGENT_BINDING_NAME,
		className: CURATOR_AGENT_CLASS_NAME,
		draftThinkspaceId,
		runtimeId,
		runtimeName,
		status: "ready",
	};
};

/**
 * The worker's ownership gate for the curation route: the draft Thinkspace must
 * exist and be owned by the caller, or the worker fails closed before any agent
 * code runs. Ownership is the only signal — a non-owner and a non-existent draft
 * are indistinguishable (both null → the worker's sealed 404). The draft id
 * keys the runtime, so the Curator survives the draft's later activation.
 */
export const getOwnedCuratorAgentRuntimeReadiness = async ({
	db,
	draftThinkspaceId,
	env,
	getThinkspaceByOwner = getThinkspace,
	ownerUserId,
}: GetOwnedCuratorAgentRuntimeReadinessInput): Promise<CuratorAgentRuntimeReadiness | null> => {
	const thinkspace = await getThinkspaceByOwner(db, {
		ownerUserId,
		thinkspaceId: draftThinkspaceId,
	});

	if (!thinkspace) {
		return null;
	}

	return resolveCuratorAgentRuntime({ draftThinkspaceId: thinkspace.id, env });
};
