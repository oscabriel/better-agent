import type { ProductDb } from "@better-agent/db";
import type { Thinkspace } from "@better-agent/db/schema/thinkspaces";

import { getThinkspace } from "./repository";

export const THINKSPACE_RUNTIME_POLICY_ID = "governed_tools_v4" as const;
export const THINKSPACE_RUNTIME_POLICY_MODE = "governed_writes" as const;
export const THINKSPACE_RUNTIME_MAX_STEPS = 1 as const;
export const THINKSPACE_RUNTIME_TOOL_MAX_STEPS = 8 as const;

export const THINKSPACE_RUNTIME_CAPABILITY_IDS = [
	"builtin_read_tools",
	"workspace_bash",
	"workspace_mutations",
	"mcp_tools",
	"connected_account_tools",
	"external_mutations",
	"memory_writes",
	"artifact_publishing",
] as const;

export type ThinkspaceRuntimeCapabilityId = (typeof THINKSPACE_RUNTIME_CAPABILITY_IDS)[number];

/**
 * The held-internal-write capability class — the mutation-shaped capability
 * `governed_tools_v3` first enabled over the read-only `safe_reads_v2` (PRD #92,
 * #93). The agent may propose a durable Product Memory, but the proposal is
 * held for the owner's Approval before it takes effect; the capability being
 * enabled never lets a write execute on its own.
 */
export const THINKSPACE_RUNTIME_HELD_WRITE_CAPABILITY_ID = "memory_writes" as const;

/**
 * The held-external-write capability class — the one mutation-shaped capability
 * `governed_tools_v4` newly enables over `governed_tools_v3` (PRD #108). The
 * agent may propose an external mutation — creating a GitHub issue through a
 * Connected Account — but, exactly like a held Memory write, the proposal is
 * held for the owner's Approval before it takes effect; enabling the capability
 * never lets a mutation execute on its own. `connected_account_tools` stays
 * disabled (reserved for future read-only Connected Account tools).
 */
export const THINKSPACE_RUNTIME_HELD_EXTERNAL_WRITE_CAPABILITY_ID = "external_mutations" as const;

/**
 * `governed_tools_v4` keeps built-in read tools enabled and holds every write
 * for Approval: it adds the held-external-write class to the held-internal-write
 * class `governed_tools_v3` already enabled, so exactly three capabilities are
 * on. Every other mutation-shaped capability — `connected_account_tools`,
 * workspace bash, and the rest — stays disabled (PRD #92, #93, #108).
 */
export const THINKSPACE_RUNTIME_ENABLED_CAPABILITY_IDS = [
	"builtin_read_tools",
	THINKSPACE_RUNTIME_HELD_WRITE_CAPABILITY_ID,
	THINKSPACE_RUNTIME_HELD_EXTERNAL_WRITE_CAPABILITY_ID,
] as const;

const ENABLED_CAPABILITY_ID_SET: ReadonlySet<ThinkspaceRuntimeCapabilityId> = new Set(
	THINKSPACE_RUNTIME_ENABLED_CAPABILITY_IDS,
);

const isCapabilityEnabledByPolicy = (id: ThinkspaceRuntimeCapabilityId): boolean =>
	ENABLED_CAPABILITY_ID_SET.has(id);

/** Every capability outside the enabled set stays disabled (PRD #92, #93). */
export const THINKSPACE_RUNTIME_DISABLED_CAPABILITY_IDS = THINKSPACE_RUNTIME_CAPABILITY_IDS.filter(
	(id) => !isCapabilityEnabledByPolicy(id),
);

export interface ThinkspaceRuntimeCapability {
	enabled: boolean;
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
	maxSteps: typeof THINKSPACE_RUNTIME_MAX_STEPS | typeof THINKSPACE_RUNTIME_TOOL_MAX_STEPS;
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
	builtin_read_tools: "Built-in read-only tools",
	connected_account_tools: "Connected Account tools",
	external_mutations: "External mutation tools",
	mcp_tools: "MCP tools",
	memory_writes: "Product Memory writes",
	workspace_bash: "Workspace Bash",
	workspace_mutations: "Mutating workspace tools",
};

export const THINKSPACE_RUNTIME_POLICY: ThinkspaceRuntimePolicy = {
	capabilities: THINKSPACE_RUNTIME_CAPABILITY_IDS.map((id) => ({
		enabled: isCapabilityEnabledByPolicy(id),
		id,
		label: CAPABILITY_LABELS[id],
	})),
	maxSteps: THINKSPACE_RUNTIME_MAX_STEPS,
	message:
		"This Thinkspace Agent can read freely and may propose durable changes — a Product Memory, or an external mutation such as creating a GitHub issue through a Connected Account — but every write is held for your Approval before it takes effect: built-in read-only tools, held Memory writes, and held external mutations are the only enabled capabilities, and each still requires enablement on the active Agent Profile revision plus a potent Permission verdict.",
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

export const createThinkspaceRuntimeTurnConfig = ({
	activeTools = [],
}: {
	activeTools?: string[];
} = {}): ThinkspaceRuntimeTurnConfig => ({
	activeTools,
	maxSteps:
		activeTools.length > 0 ? THINKSPACE_RUNTIME_TOOL_MAX_STEPS : THINKSPACE_RUNTIME_POLICY.maxSteps,
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
