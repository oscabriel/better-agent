/**
 * The external-mutation half of the Thinkspace Agent turn loop's policy guard.
 *
 * External-mutation tools are connected-account tools whose action class is a
 * held external write — `create_github_issue` (tool id `github:create_issue`)
 * is the first (PRD #108). They ride the `external_mutations` capability, the
 * held-external-write class, exactly as the held Memory-proposing tool rides
 * `memory_writes`, the held-internal-write class. The held tool factory itself
 * arrives in a later issue; this module carries the policy-level pieces #112
 * needs: which tool ids are external mutations, which capability governs them,
 * and the fail-closed assembly guard mirroring the built-in-tools support
 * assertion.
 */
import { markThinkspaceTurnProductSafeError } from "./inspect";
import {
	isThinkspaceRuntimeCapabilityEnabled,
	THINKSPACE_RUNTIME_HELD_EXTERNAL_WRITE_CAPABILITY_ID,
	THINKSPACE_RUNTIME_POLICY,
} from "./runtime-policy";
import type { ThinkspaceRuntimeCapabilityId, ThinkspaceRuntimePolicy } from "./runtime-policy";

const POLICY_ASSEMBLY_MISMATCH_MESSAGE =
	"This Thinkspace Agent turn was stopped before it started: the runtime safety policy and the assembled tools disagree.";

/**
 * The external-mutation tool ids, in the `${catalogId}:${toolName}` product
 * convention shared with MCP (`serverId:tool`) and the connected-account
 * Permission/credential lookup. `github:create_issue` is the only one today;
 * its held tool factory lands in a later issue.
 */
export const EXTERNAL_MUTATION_TOOL_IDS = ["github:create_issue"] as const;

export type ExternalMutationToolId = (typeof EXTERNAL_MUTATION_TOOL_IDS)[number];

export const isExternalMutationToolId = (value: string): value is ExternalMutationToolId =>
	EXTERNAL_MUTATION_TOOL_IDS.includes(value as ExternalMutationToolId);

const activeExternalMutationToolIds = (
	activeProductToolIds: readonly string[],
): ExternalMutationToolId[] => activeProductToolIds.filter(isExternalMutationToolId);

/**
 * Which runtime capability class governs an external-mutation tool: every one
 * rides the `external_mutations` held-external-write class (the action-class
 * precedent set by `memory_write → memory_writes`; no separate source
 * capability). The fail-closed assembly guard uses this so an external-mutation
 * tool can never go active under a policy that has held external writes
 * disabled.
 */
export const externalMutationToolRuntimeCapabilityId = (
	_toolId: ExternalMutationToolId,
): ThinkspaceRuntimeCapabilityId => THINKSPACE_RUNTIME_HELD_EXTERNAL_WRITE_CAPABILITY_ID;

/**
 * The zero-blast-radius guarantee must survive bugs (PRD #92, #108), mirroring
 * the built-in-tools support assertion: if assembly produced an active
 * external-mutation tool while the runtime policy has held external writes
 * disabled — or workspace bash is not forced off — the turn fails
 * product-safely before any inference happens. A turn with no active
 * external-mutation tool passes untouched, so read-only and memory-only turns
 * behave exactly as before.
 */
export const assertThinkspaceRuntimePolicySupportsExternalMutationTools = ({
	activeProductToolIds,
	policy = THINKSPACE_RUNTIME_POLICY,
}: {
	activeProductToolIds: readonly string[];
	policy?: ThinkspaceRuntimePolicy;
}): void => {
	if (policy.workspaceBash !== false) {
		throw new Error(markThinkspaceTurnProductSafeError(POLICY_ASSEMBLY_MISMATCH_MESSAGE));
	}

	for (const toolId of activeExternalMutationToolIds(activeProductToolIds)) {
		if (
			!isThinkspaceRuntimeCapabilityEnabled(policy, externalMutationToolRuntimeCapabilityId(toolId))
		) {
			throw new Error(markThinkspaceTurnProductSafeError(POLICY_ASSEMBLY_MISMATCH_MESSAGE));
		}
	}
};
