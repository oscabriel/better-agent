export type ToolRisk = "read_only" | "mutating" | "unknown";
export type PermissionDecision =
	| "possible_access"
	| "approved_action_required"
	| "allowed_without_approval";

export interface ThinkspaceToolSelection {
	serverId: string;
	toolName?: string;
	risk: ToolRisk;
}

export interface PermissionPolicyInput {
	hasPermission: boolean;
	risk: ToolRisk;
	standingApproval?: boolean;
}

export const DEFAULT_APPROVAL_POLICY = {
	mutating: "draft_or_explicit_approval",
	readOnly: "permission_required",
	unknown: "explicit_approval_required",
} as const;

export class PermissionPolicyError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "PermissionPolicyError";
	}
}

export const assessPermissionPolicy = ({
	hasPermission,
	risk,
	standingApproval = false,
}: PermissionPolicyInput): PermissionDecision => {
	if (!hasPermission) {
		return "possible_access";
	}

	if (risk === "read_only" && standingApproval) {
		return "allowed_without_approval";
	}

	return "approved_action_required";
};

export const createToolPermissionPlaceholder = (selection: ThinkspaceToolSelection) => ({
	actions: selection.risk === "read_only" ? ["read"] : ["propose_action"],
	approvalRequired: selection.risk !== "read_only",
	resource: {
		serverId: selection.serverId,
		toolName: selection.toolName ?? "any_explicitly_enabled_tool",
	},
	risk: selection.risk,
	type: "mcp_tool_permission_placeholder",
});

export const serializeThinkspaceToolSelections = (
	selections: ThinkspaceToolSelection[],
): string => {
	const seen = new Set<string>();
	const normalized = selections.map((selection) => {
		const serverId = selection.serverId.trim();
		const toolName = selection.toolName?.trim() || undefined;
		if (!serverId) {
			throw new PermissionPolicyError("Enabled tool selections require a server ID.");
		}
		const key = `${serverId}:${toolName ?? "*"}`;
		if (seen.has(key)) {
			throw new PermissionPolicyError("Enabled tool selections must be unique per Thinkspace.");
		}
		seen.add(key);
		return { risk: selection.risk, serverId, toolName };
	});

	return JSON.stringify(normalized);
};
