import type { ProductDb } from "@better-agent/db";
import type { Thinkspace } from "@better-agent/db/schema/thinkspaces";
import type { CloudflareEnv } from "@better-agent/env/types";

import { getThinkspace } from "./repository";

export const THINKSPACE_AGENT_BINDING_NAME = "THINKSPACE_AGENT" as const;
export const THINKSPACE_AGENT_CLASS_NAME = "ThinkspaceAgent" as const;

export interface ThinkspaceAgentRuntimeReadiness {
	bindingName: typeof THINKSPACE_AGENT_BINDING_NAME;
	className: typeof THINKSPACE_AGENT_CLASS_NAME;
	runtimeId: string;
	runtimeName: string;
	status: "ready";
	thinkspaceId: string;
}

export interface ResolveThinkspaceAgentRuntimeInput {
	env: Pick<CloudflareEnv, typeof THINKSPACE_AGENT_BINDING_NAME>;
	thinkspaceId: string;
}

export interface GetOwnedThinkspaceAgentRuntimeReadinessInput extends ResolveThinkspaceAgentRuntimeInput {
	db: ProductDb;
	ownerUserId: string;
	getThinkspaceByOwner?: GetThinkspaceByOwner;
}

type GetThinkspaceByOwner = (
	db: ProductDb,
	input: { ownerUserId: string; thinkspaceId: string },
) => Promise<Pick<Thinkspace, "id"> | null>;

export class ThinkspaceRuntimeResolutionError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "ThinkspaceRuntimeResolutionError";
	}
}

export const getThinkspaceAgentRuntimeName = (thinkspaceId: string): string => {
	const runtimeName = thinkspaceId.trim();

	if (!runtimeName) {
		throw new ThinkspaceRuntimeResolutionError(
			"Thinkspace Agent runtime identity requires a Thinkspace id.",
		);
	}

	return runtimeName;
};

export const resolveThinkspaceAgentRuntime = ({
	env,
	thinkspaceId,
}: ResolveThinkspaceAgentRuntimeInput): ThinkspaceAgentRuntimeReadiness => {
	const namespace = env[THINKSPACE_AGENT_BINDING_NAME];

	if (!namespace) {
		throw new ThinkspaceRuntimeResolutionError(
			"Thinkspace Agent runtime binding is not available.",
		);
	}

	const runtimeName = getThinkspaceAgentRuntimeName(thinkspaceId);
	const runtimeId = namespace.idFromName(runtimeName).toString();

	return {
		bindingName: THINKSPACE_AGENT_BINDING_NAME,
		className: THINKSPACE_AGENT_CLASS_NAME,
		runtimeId,
		runtimeName,
		status: "ready",
		thinkspaceId,
	};
};

export const getOwnedThinkspaceAgentRuntimeReadiness = async ({
	db,
	env,
	getThinkspaceByOwner = getThinkspace,
	ownerUserId,
	thinkspaceId,
}: GetOwnedThinkspaceAgentRuntimeReadinessInput): Promise<ThinkspaceAgentRuntimeReadiness | null> => {
	const thinkspace = await getThinkspaceByOwner(db, { ownerUserId, thinkspaceId });

	if (!thinkspace) {
		return null;
	}

	return resolveThinkspaceAgentRuntime({ env, thinkspaceId: thinkspace.id });
};
