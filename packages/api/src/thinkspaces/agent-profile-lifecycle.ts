/**
 * Pure Agent Profile lifecycle transitions (ADR-0007).
 *
 * Revisions move draft -> active -> superseded. A draft takes effect only
 * when the user explicitly activates it; activation is the single trigger
 * for reconciling derived runtime state (DO profile snapshot, schedule
 * reconciliation) and it enters the Audit Trail. The first activation also
 * activates a draft Thinkspace: a Thinkspace becomes active when its Goal
 * and first Agent Profile revision are activated together.
 *
 * These functions compute transitions only; persistence belongs to the
 * repository adapter and runtime reconciliation to the runtime adapter.
 */
import { THINKSPACE_STATUS } from "@better-agent/db/schema/thinkspaces";
import type { NewThinkspace, Thinkspace } from "@better-agent/db/schema/thinkspaces";

import { AGENT_PROFILE_REVISION_STATUS } from "./agent-profile";
import type {
	ActiveAgentProfileRevision,
	AgentProfileIdentity,
	AgentProfileModelBehavior,
	DraftAgentProfileRevision,
	RequestedPermission,
	Routine,
	SkillReference,
	SupersededAgentProfileRevision,
	ToolEnablement,
} from "./agent-profile";

export const FIRST_AGENT_PROFILE_VERSION = 1;

export class AgentProfileLifecycleError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "AgentProfileLifecycleError";
	}
}

export interface CreateInitialAgentProfileDraftInput {
	id: string;
	identity: AgentProfileIdentity;
	modelBehavior: AgentProfileModelBehavior;
	now?: Date;
	requestedPermissions?: RequestedPermission[];
	routines?: Routine[];
	skillReferences?: SkillReference[];
	thinkspaceId: string;
	toolEnablements?: ToolEnablement[];
}

export const createInitialAgentProfileDraft = ({
	id,
	identity,
	modelBehavior,
	now = new Date(),
	requestedPermissions = [],
	routines = [],
	skillReferences = [],
	thinkspaceId,
	toolEnablements = [],
}: CreateInitialAgentProfileDraftInput): DraftAgentProfileRevision => {
	if (!id) {
		throw new AgentProfileLifecycleError("An Agent Profile revision needs a stable identifier.");
	}

	if (!thinkspaceId) {
		throw new AgentProfileLifecycleError("An Agent Profile revision belongs to one Thinkspace.");
	}

	return {
		createdAt: now,
		id,
		identity,
		modelBehavior,
		requestedPermissions,
		routines,
		skillReferences,
		status: AGENT_PROFILE_REVISION_STATUS.DRAFT,
		thinkspaceId,
		toolEnablements,
		updatedAt: now,
		version: FIRST_AGENT_PROFILE_VERSION,
	};
};

export interface CreateAgentProfileDraftFromActiveInput {
	active: ActiveAgentProfileRevision;
	id: string;
	now?: Date;
}

/**
 * Starts the next resumable draft from the currently active revision. The
 * active revision keeps running until the user activates the new draft.
 */
export const createAgentProfileDraftFromActive = ({
	active,
	id,
	now = new Date(),
}: CreateAgentProfileDraftFromActiveInput): DraftAgentProfileRevision => {
	if (!id) {
		throw new AgentProfileLifecycleError("An Agent Profile revision needs a stable identifier.");
	}

	if (id === active.id) {
		throw new AgentProfileLifecycleError(
			"A new Agent Profile draft cannot reuse the active revision's identifier.",
		);
	}

	return {
		createdAt: now,
		id,
		identity: active.identity,
		modelBehavior: active.modelBehavior,
		requestedPermissions: [],
		routines: active.routines,
		skillReferences: active.skillReferences,
		status: AGENT_PROFILE_REVISION_STATUS.DRAFT,
		thinkspaceId: active.thinkspaceId,
		toolEnablements: active.toolEnablements,
		updatedAt: now,
		version: active.version + 1,
	};
};

export interface CreateAgentProfileActivationInput {
	currentActive: ActiveAgentProfileRevision | null;
	draft: DraftAgentProfileRevision;
	now?: Date;
	thinkspace: Pick<Thinkspace, "id" | "status">;
}

export interface AgentProfileActivation {
	activatedRevision: ActiveAgentProfileRevision;
	supersededRevision: SupersededAgentProfileRevision | null;
	/**
	 * Non-null exactly when this is the first activation of a draft
	 * Thinkspace: Goal and first revision activate together.
	 */
	thinkspaceActivationPatch: Pick<NewThinkspace, "status" | "updatedAt"> | null;
}

export const createAgentProfileActivation = ({
	currentActive,
	draft,
	now = new Date(),
	thinkspace,
}: CreateAgentProfileActivationInput): AgentProfileActivation => {
	if (draft.thinkspaceId !== thinkspace.id) {
		throw new AgentProfileLifecycleError(
			"An Agent Profile draft can only be activated for its own Thinkspace.",
		);
	}

	if (thinkspace.status === THINKSPACE_STATUS.ARCHIVED) {
		throw new AgentProfileLifecycleError(
			"Archived Thinkspaces cannot activate Agent Profile revisions.",
		);
	}

	if (currentActive) {
		if (currentActive.thinkspaceId !== draft.thinkspaceId) {
			throw new AgentProfileLifecycleError(
				"The active Agent Profile revision belongs to a different Thinkspace.",
			);
		}

		if (currentActive.version >= draft.version) {
			throw new AgentProfileLifecycleError(
				"An Agent Profile draft must supersede the active revision with a newer version.",
			);
		}
	}

	if (!currentActive && draft.version !== FIRST_AGENT_PROFILE_VERSION) {
		throw new AgentProfileLifecycleError(
			"Only the first Agent Profile revision can activate without a predecessor.",
		);
	}

	// Requested Permissions never carry past activation; granting them is a
	// user decision recorded in Thinkspace-owned Permission storage.
	const activatedRevision: ActiveAgentProfileRevision = {
		activatedAt: now,
		createdAt: draft.createdAt,
		id: draft.id,
		identity: draft.identity,
		modelBehavior: draft.modelBehavior,
		routines: draft.routines,
		skillReferences: draft.skillReferences,
		status: AGENT_PROFILE_REVISION_STATUS.ACTIVE,
		thinkspaceId: draft.thinkspaceId,
		toolEnablements: draft.toolEnablements,
		updatedAt: now,
		version: draft.version,
	};

	const supersededRevision: SupersededAgentProfileRevision | null = currentActive
		? {
				activatedAt: currentActive.activatedAt,
				createdAt: currentActive.createdAt,
				id: currentActive.id,
				identity: currentActive.identity,
				modelBehavior: currentActive.modelBehavior,
				routines: currentActive.routines,
				skillReferences: currentActive.skillReferences,
				status: AGENT_PROFILE_REVISION_STATUS.SUPERSEDED,
				supersededAt: now,
				thinkspaceId: currentActive.thinkspaceId,
				toolEnablements: currentActive.toolEnablements,
				updatedAt: now,
				version: currentActive.version,
			}
		: null;

	const thinkspaceActivationPatch =
		thinkspace.status === THINKSPACE_STATUS.DRAFT
			? { status: THINKSPACE_STATUS.ACTIVE, updatedAt: now }
			: null;

	return { activatedRevision, supersededRevision, thinkspaceActivationPatch };
};
