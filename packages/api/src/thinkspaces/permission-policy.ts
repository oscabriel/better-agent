/**
 * Permission policy seam.
 *
 * "Enablement makes a tool present; a Permission makes it potent." The Agent
 * Profile decides presence; this seam decides potency, owned by the
 * Thinkspace. It is consulted in two places: turn assembly (which enabled
 * tools become active) and the runtime adapter's beforeToolCall enforcement
 * layer. Revoking a Permission never edits the Profile — the tool simply
 * goes inert.
 *
 * Permission storage does not exist yet; the adapters here encode only the
 * documented conservative rule and the test seam.
 */
import type { ToolEnablement } from "./agent-profile";

export type ToolPotency = "potent" | "inert";

export interface ToolPotencyVerdict {
	potency: ToolPotency;
	toolId: string;
}

export interface EvaluateToolPotencyInput {
	enablements: ToolEnablement[];
	thinkspaceId: string;
}

export interface ThinkspacePermissionPolicy {
	evaluateToolPotency: (input: EvaluateToolPotencyInput) => Promise<ToolPotencyVerdict[]>;
}

export class PermissionPolicyNotImplementedError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "PermissionPolicyNotImplementedError";
	}
}

/**
 * The documented default until Permission storage exists: safe built-in
 * tools need only enablement; tools reaching protected resources
 * (Connected Accounts, MCP servers, Local Nodes) are inert without a
 * Thinkspace-owned Permission — and no Permission can be granted yet.
 */
export const createEnablementOnlyPermissionPolicy = (): ThinkspacePermissionPolicy => ({
	evaluateToolPotency: ({ enablements }) =>
		Promise.resolve(
			enablements.map((enablement) => ({
				potency: enablement.source === "built_in" ? "potent" : "inert",
				toolId: enablement.toolId,
			})),
		),
});

/** Test adapter with caller-chosen verdicts per tool id. */
export const createMemoryPermissionPolicy = (
	potencies: Record<string, ToolPotency>,
): ThinkspacePermissionPolicy => ({
	evaluateToolPotency: ({ enablements }) =>
		Promise.resolve(
			enablements.map((enablement) => ({
				potency: potencies[enablement.toolId] ?? "inert",
				toolId: enablement.toolId,
			})),
		),
});

/**
 * Architecture slot for the real Permission-storage-backed policy. Fails
 * with a typed error until the Permission behavior slice implements it.
 */
export const createPermissionStorePolicy = (): ThinkspacePermissionPolicy => ({
	evaluateToolPotency: () =>
		Promise.reject(
			new PermissionPolicyNotImplementedError(
				"Thinkspace Permission storage is not implemented yet.",
			),
		),
});
