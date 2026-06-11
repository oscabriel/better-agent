import { THINKSPACE_STATUS } from "@better-agent/db/schema/thinkspaces";
import type { NewThinkspace } from "@better-agent/db/schema/thinkspaces";

const MAX_GOAL_LENGTH = 280;
const MAX_CONFIGURATION_SUMMARY_LENGTH = 1600;

export const THINKSPACE_CREATION_DEFAULTS = {
	approvalDefaults: {
		externalMutations: "require_approval",
	},
	enabledToolIds: [] as string[],
	memoryGovernance: {
		retention: "user_reviewed",
	},
	requestedPermissions: [] as string[],
} as const;

export interface CreateThinkspaceLifecycleInput {
	configurationSummary?: string | null;
	goal: string;
	id: string;
	ownerUserId: string;
}

export class ThinkspaceLifecycleValidationError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "ThinkspaceLifecycleValidationError";
	}
}

const normalizeText = (value: string | null | undefined): string => value?.trim() ?? "";

const assertMaxLength = (label: string, value: string, maxLength: number) => {
	if (value.length > maxLength) {
		throw new ThinkspaceLifecycleValidationError(
			`${label} must be ${maxLength} characters or fewer.`,
		);
	}
};

const buildDefaultConfigurationSummary = (goal: string): string =>
	[
		`Goal: ${goal}`,
		"Initial configuration keeps Skills, tools, requested Permissions, and Approval policy placeholders empty until the user deliberately scopes them.",
		"Memory governance starts in user-reviewed mode so retained understanding is accepted intentionally.",
	].join("\n");

export const createThinkspaceArchivePatch = (
	status: string,
): Pick<NewThinkspace, "archivedAt" | "status" | "updatedAt"> => {
	if (status === THINKSPACE_STATUS.ARCHIVED) {
		throw new ThinkspaceLifecycleValidationError("This Thinkspace is already archived.");
	}

	if (status !== THINKSPACE_STATUS.ACTIVE) {
		throw new ThinkspaceLifecycleValidationError("Only active Thinkspaces can be archived.");
	}

	const archivedAt = new Date();

	return {
		archivedAt,
		status: THINKSPACE_STATUS.ARCHIVED,
		updatedAt: archivedAt,
	};
};

export const createThinkspaceCreationRecord = ({
	configurationSummary,
	goal,
	id,
	ownerUserId,
}: CreateThinkspaceLifecycleInput): NewThinkspace => {
	const normalizedGoal = normalizeText(goal);
	const normalizedSummary = normalizeText(configurationSummary);

	if (!ownerUserId) {
		throw new ThinkspaceLifecycleValidationError(
			"A Thinkspace must belong to an authenticated owner.",
		);
	}

	if (!id) {
		throw new ThinkspaceLifecycleValidationError("A Thinkspace requires a stable identifier.");
	}

	if (!normalizedGoal) {
		throw new ThinkspaceLifecycleValidationError("Goal is required to create a Thinkspace.");
	}

	assertMaxLength("Goal", normalizedGoal, MAX_GOAL_LENGTH);
	assertMaxLength("Configuration summary", normalizedSummary, MAX_CONFIGURATION_SUMMARY_LENGTH);

	return {
		approvalDefaults: JSON.stringify(THINKSPACE_CREATION_DEFAULTS.approvalDefaults),
		configurationSummary: normalizedSummary || buildDefaultConfigurationSummary(normalizedGoal),
		enabledToolIds: JSON.stringify(THINKSPACE_CREATION_DEFAULTS.enabledToolIds),
		goal: normalizedGoal,
		id,
		memoryGovernance: JSON.stringify(THINKSPACE_CREATION_DEFAULTS.memoryGovernance),
		ownerUserId,
		requestedPermissions: JSON.stringify(THINKSPACE_CREATION_DEFAULTS.requestedPermissions),
		status: THINKSPACE_STATUS.DRAFT,
	};
};
