import type { ProductDb } from "@better-agent/db";
import type { Thinkspace } from "@better-agent/db/schema/thinkspaces";

import { getThinkspace } from "./repository";

export const THINKSPACE_RUNTIME_POLICY_ID = "no_tools_v1" as const;
export const THINKSPACE_RUNTIME_POLICY_MODE = "model_only" as const;
export const THINKSPACE_RUNTIME_MAX_STEPS = 1 as const;

export const THINKSPACE_RUNTIME_CAPABILITY_IDS = [
	"workspace_bash",
	"workspace_mutations",
	"mcp_tools",
	"connected_account_tools",
	"external_mutations",
	"memory_writes",
	"artifact_publishing",
] as const;

export type ThinkspaceRuntimeCapabilityId = (typeof THINKSPACE_RUNTIME_CAPABILITY_IDS)[number];

export interface ThinkspaceRuntimeCapability {
	enabled: false;
	id: ThinkspaceRuntimeCapabilityId;
	label: string;
}

export interface ThinkspaceRuntimePolicy {
	capabilities: readonly ThinkspaceRuntimeCapability[];
	maxSteps: typeof THINKSPACE_RUNTIME_MAX_STEPS;
	message: string;
	mode: typeof THINKSPACE_RUNTIME_POLICY_MODE;
	policyId: typeof THINKSPACE_RUNTIME_POLICY_ID;
	workspaceBash: false;
}

export interface ThinkspaceRuntimePolicyReport extends ThinkspaceRuntimePolicy {
	thinkspaceId: string;
}

export interface ThinkspaceRuntimeTurnConfig {
	activeTools: string[];
	maxSteps: typeof THINKSPACE_RUNTIME_MAX_STEPS;
}

export interface GetOwnedThinkspaceRuntimePolicyInput {
	db: ProductDb;
	getThinkspaceByOwner?: GetThinkspaceByOwner;
	ownerUserId: string;
	thinkspaceId: string;
}

type GetThinkspaceByOwner = (
	db: ProductDb,
	input: { ownerUserId: string; thinkspaceId: string },
) => Promise<Pick<Thinkspace, "id"> | null>;

const CAPABILITY_LABELS: Record<ThinkspaceRuntimeCapabilityId, string> = {
	artifact_publishing: "Artifact publishing",
	connected_account_tools: "Connected Account tools",
	external_mutations: "External mutation tools",
	mcp_tools: "MCP tools",
	memory_writes: "Product Memory writes",
	workspace_bash: "Workspace Bash",
	workspace_mutations: "Mutating workspace tools",
};

export const THINKSPACE_RUNTIME_POLICY: ThinkspaceRuntimePolicy = {
	capabilities: THINKSPACE_RUNTIME_CAPABILITY_IDS.map((id) => ({
		enabled: false,
		id,
		label: CAPABILITY_LABELS[id],
	})),
	maxSteps: THINKSPACE_RUNTIME_MAX_STEPS,
	message:
		"This Thinkspace Agent runs model-only. No tools are enabled in this slice; future tool use requires Thinkspace-scoped Permission policy.",
	mode: THINKSPACE_RUNTIME_POLICY_MODE,
	policyId: THINKSPACE_RUNTIME_POLICY_ID,
	workspaceBash: false,
} as const;

export const isThinkspaceRuntimeCapabilityEnabled = (
	policy: ThinkspaceRuntimePolicy,
	capabilityId: ThinkspaceRuntimeCapabilityId,
): boolean =>
	policy.capabilities.some((capability) => capability.id === capabilityId && capability.enabled);

export const createThinkspaceRuntimeToolSet = (): Record<string, never> => ({});

export const createThinkspaceRuntimeTurnConfig = (): ThinkspaceRuntimeTurnConfig => ({
	activeTools: [],
	maxSteps: THINKSPACE_RUNTIME_POLICY.maxSteps,
});

export const getOwnedThinkspaceRuntimePolicy = async ({
	db,
	getThinkspaceByOwner = getThinkspace,
	ownerUserId,
	thinkspaceId,
}: GetOwnedThinkspaceRuntimePolicyInput): Promise<ThinkspaceRuntimePolicyReport | null> => {
	const thinkspace = await getThinkspaceByOwner(db, { ownerUserId, thinkspaceId });

	if (!thinkspace) {
		return null;
	}

	return { ...THINKSPACE_RUNTIME_POLICY, thinkspaceId: thinkspace.id };
};
