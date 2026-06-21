import { THINKSPACE_STATUS } from "@better-agent/db/schema/thinkspaces";
import type { NewThinkspace } from "@better-agent/db/schema/thinkspaces";

export const MAX_GOAL_LENGTH = 280;
export const MAX_CONFIGURATION_SUMMARY_LENGTH = 1600;

export const THINKSPACE_CREATION_DEFAULTS = {
	memoryGovernance: {
		retention: "user_reviewed",
	},
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
		"Initial configuration keeps Skills and Permission requests empty until the user deliberately scopes them.",
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

export interface CreateCurationDraftThinkspaceInput {
	id: string;
	ownerUserId: string;
}

/**
 * Mints the empty-Goal DRAFT a curation conversation opens against. Unlike
 * `createThinkspaceCreationRecord`, there is no user-authored Goal yet — the
 * Curator's `set_*` tools (#127) fill the Goal and configuration as the
 * conversation shapes the agent. The empty Goal is the signal `listThinkspaces`
 * filters on to keep in-progress curations out of the main list; a draft that
 * later gains a Goal reappears. An abandoned empty draft persists (no GC): the
 * judgement already spent in the session is never silently discarded.
 */
export const createCurationDraftThinkspaceRecord = ({
	id,
	ownerUserId,
}: CreateCurationDraftThinkspaceInput): NewThinkspace => {
	if (!ownerUserId) {
		throw new ThinkspaceLifecycleValidationError(
			"A Thinkspace must belong to an authenticated owner.",
		);
	}

	if (!id) {
		throw new ThinkspaceLifecycleValidationError("A Thinkspace requires a stable identifier.");
	}

	return {
		configurationSummary: "",
		goal: "",
		id,
		memoryGovernance: JSON.stringify(THINKSPACE_CREATION_DEFAULTS.memoryGovernance),
		ownerUserId,
		status: THINKSPACE_STATUS.DRAFT,
	};
};

/**
 * Validates a Goal the Curator proposes for a draft Thinkspace: a non-empty,
 * length-bounded string. A real Goal is what flips an in-progress curation
 * draft back into the owner's list (#126), so an empty Goal is rejected here
 * just as it is at form-based creation.
 */
export const validateCurationGoal = (goal: string): string => {
	const normalized = normalizeText(goal);

	if (!normalized) {
		throw new ThinkspaceLifecycleValidationError("Goal is required to shape a Thinkspace.");
	}

	assertMaxLength("Goal", normalized, MAX_GOAL_LENGTH);

	return normalized;
};

/**
 * Validates a configuration summary the Curator proposes: length-bounded, and
 * allowed to be cleared back to empty.
 */
export const validateCurationConfigurationSummary = (summary: string): string => {
	const normalized = normalizeText(summary);

	assertMaxLength("Configuration summary", normalized, MAX_CONFIGURATION_SUMMARY_LENGTH);

	return normalized;
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
		configurationSummary: normalizedSummary || buildDefaultConfigurationSummary(normalizedGoal),
		goal: normalizedGoal,
		id,
		memoryGovernance: JSON.stringify(THINKSPACE_CREATION_DEFAULTS.memoryGovernance),
		ownerUserId,
		status: THINKSPACE_STATUS.DRAFT,
	};
};
