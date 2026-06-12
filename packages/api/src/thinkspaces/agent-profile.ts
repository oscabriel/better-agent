/**
 * Agent Profile domain model.
 *
 * The Agent Profile is the user-facing descriptor of one Thinkspace Agent's
 * identity and behavior. It owns only the pieces with no other home (name,
 * instructions, model behavior) and references the rest: tool enablements,
 * Skills, and Routines keep their own ownership and governance.
 *
 * Invariant ("Profile proposes, Permission disposes"): the Profile never
 * contains Permission or Approval data. Enablement makes a tool present; a
 * Thinkspace-owned Permission makes it potent. A draft revision may carry
 * requested Permissions, but only the user grants them, at activation.
 *
 * This module never imports `@cloudflare/think`: Think is the runtime
 * substrate behind the adapter boundary (ADR-0006), and "scheduled task" is
 * a Think implementation term that Routines map onto only inside the
 * runtime adapter.
 */
import { AGENT_PROFILE_REVISION_STATUS } from "@better-agent/db/schema/agent-profiles";
import type {
	AgentProfileRevisionStatus,
	NewThinkspaceAgentProfile,
	ThinkspaceAgentProfile,
} from "@better-agent/db/schema/agent-profiles";

import { MODEL_PROVIDER_IDS } from "../models/catalog";
import type { ModelCatalogEntry, ModelProviderId } from "../models/catalog";
import type { CatalogModelId } from "../models/model-catalog";
import { createUnknownCatalogModelError } from "../models/model-catalog";

export { AGENT_PROFILE_REVISION_STATUS };
export type { AgentProfileRevisionStatus };

export const AGENT_PROFILE_DISPLAY_NAME_MAX_LENGTH = 120;
export const AGENT_PROFILE_INSTRUCTIONS_MAX_LENGTH = 4000;
export const ROUTINE_NAME_MAX_LENGTH = 120;
export const ROUTINE_INSTRUCTION_MAX_LENGTH = 2000;
export const ROUTINE_SCHEDULE_MAX_LENGTH = 280;

/**
 * The only model-behavior surface a user shapes: which model, and how hard
 * it reasons. Granular sampling knobs (temperature, topP, token caps) are
 * deliberately not representable; translating a reasoning level into
 * provider-specific options is the runtime adapter's job.
 */
export const AGENT_PROFILE_REASONING_LEVELS = ["none", "low", "medium", "high"] as const;
export type AgentProfileReasoningLevel = (typeof AGENT_PROFILE_REASONING_LEVELS)[number];

export interface AgentProfileIdentity {
	displayName: string;
	instructions: string;
}

export interface AgentProfileModelBehavior {
	modelId: CatalogModelId;
	reasoningLevel: AgentProfileReasoningLevel;
}

export const TOOL_ENABLEMENT_SOURCES = [
	"built_in",
	"mcp_server",
	"connected_account",
	"local_node",
] as const;
export type ToolEnablementSource = (typeof TOOL_ENABLEMENT_SOURCES)[number];

/**
 * A Profile-level reference that makes a tool present for the Thinkspace
 * Agent. Presence is not potency: tools that reach protected resources stay
 * inert until the Thinkspace's Permission policy says otherwise.
 */
export interface ToolEnablement {
	source: ToolEnablementSource;
	toolId: string;
}

/** Reference to a Skill enabled for this Thinkspace from the Skill catalog. */
export interface SkillReference {
	skillId: string;
}

/**
 * How a Routine recurs. Domain-side only; mapping to Think's typed schedule
 * shapes happens in the runtime adapter.
 */
export type RoutineSchedule =
	| { expression: string; kind: "cron" }
	| { description: string; kind: "natural_language" };

/**
 * A recurring instruction the Thinkspace Agent performs on a schedule in
 * service of the Goal. Routine output enters the Review Queue under
 * Backpressure like any other agent production. Routines are versioned as
 * part of the Profile revision snapshot so that activation atomically
 * defines the schedule set to reconcile.
 */
export interface Routine {
	instruction: string;
	name: string;
	routineId: string;
	schedule: RoutineSchedule;
}

/**
 * A Permission *request* carried by a draft revision. The Curator proposes;
 * only the user grants, at activation, into Thinkspace-owned Permission
 * storage. Requests never appear on active or superseded revisions.
 */
export interface ModelProviderCredentialPermissionRequest {
	kind: "model_provider_credential";
	providerId: ModelProviderId;
	reason: string;
}

export const MCP_TOOL_ACCESS_REQUEST_RISKS = ["read_only", "mutating", "unknown"] as const;
export type McpToolAccessRequestRisk = (typeof MCP_TOOL_ACCESS_REQUEST_RISKS)[number];

export type McpToolAccessScope = { type: "server" } | { toolName: string; type: "tool" };

export interface McpToolAccessPermissionRequest {
	kind: "mcp_tool_access";
	reason: string;
	risk: McpToolAccessRequestRisk;
	scope: McpToolAccessScope;
	serverId: string;
}

export const BUILT_IN_TOOL_PERMISSION_REQUEST_KINDS = [
	"built_in_source_read",
	"built_in_web_read",
] as const;
export type BuiltInToolPermissionRequestKind =
	(typeof BUILT_IN_TOOL_PERMISSION_REQUEST_KINDS)[number];

/**
 * A request for one of the built-in read tool Permission kinds: web reading
 * (search and fetch together) or Source reading. The kind itself names the
 * governed resource, so no extra scope payload is carried.
 */
export interface BuiltInToolAccessPermissionRequest {
	kind: BuiltInToolPermissionRequestKind;
	reason: string;
}

export type RequestedPermission =
	| BuiltInToolAccessPermissionRequest
	| ModelProviderCredentialPermissionRequest
	| McpToolAccessPermissionRequest;

interface AgentProfileRevisionBase {
	createdAt: Date;
	id: string;
	identity: AgentProfileIdentity;
	modelBehavior: AgentProfileModelBehavior;
	routines: Routine[];
	skillReferences: SkillReference[];
	thinkspaceId: string;
	toolEnablements: ToolEnablement[];
	updatedAt: Date;
	version: number;
}

export interface DraftAgentProfileRevision extends AgentProfileRevisionBase {
	requestedPermissions: RequestedPermission[];
	status: typeof AGENT_PROFILE_REVISION_STATUS.DRAFT;
}

export interface ActiveAgentProfileRevision extends AgentProfileRevisionBase {
	activatedAt: Date;
	status: typeof AGENT_PROFILE_REVISION_STATUS.ACTIVE;
}

export interface SupersededAgentProfileRevision extends AgentProfileRevisionBase {
	activatedAt: Date;
	status: typeof AGENT_PROFILE_REVISION_STATUS.SUPERSEDED;
	supersededAt: Date;
}

export type AgentProfileRevision =
	| DraftAgentProfileRevision
	| ActiveAgentProfileRevision
	| SupersededAgentProfileRevision;

export class AgentProfileValidationError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "AgentProfileValidationError";
	}
}

const normalizeText = (value: string | null | undefined): string => value?.trim() ?? "";

const assertMaxLength = (label: string, value: string, maxLength: number) => {
	if (value.length > maxLength) {
		throw new AgentProfileValidationError(`${label} must be ${maxLength} characters or fewer.`);
	}
};

export const validateAgentProfileIdentity = (input: {
	displayName: string;
	instructions: string;
}): AgentProfileIdentity => {
	const displayName = normalizeText(input.displayName);
	const instructions = normalizeText(input.instructions);

	if (!displayName) {
		throw new AgentProfileValidationError("An Agent Profile needs a display name.");
	}

	assertMaxLength("Agent Profile display name", displayName, AGENT_PROFILE_DISPLAY_NAME_MAX_LENGTH);
	assertMaxLength(
		"Agent Profile instructions",
		instructions,
		AGENT_PROFILE_INSTRUCTIONS_MAX_LENGTH,
	);

	return { displayName, instructions };
};

export const isAgentProfileReasoningLevel = (value: unknown): value is AgentProfileReasoningLevel =>
	typeof value === "string" &&
	AGENT_PROFILE_REASONING_LEVELS.includes(value as AgentProfileReasoningLevel);

/**
 * Validates the (model, reasoning level) pair against a catalog entry.
 * Non-reasoning models must use "none"; reasoning-capable models must pick
 * an actual level, so an Agent Profile can never hold an ambiguous pairing.
 */
export const validateAgentProfileModelBehavior = (input: {
	catalogEntry: ModelCatalogEntry | null;
	modelId: string;
	reasoningLevel: string;
}): AgentProfileModelBehavior => {
	const { catalogEntry } = input;

	if (!catalogEntry) {
		throw createUnknownCatalogModelError(input.modelId);
	}

	if (!isAgentProfileReasoningLevel(input.reasoningLevel)) {
		throw new AgentProfileValidationError(
			`"${input.reasoningLevel}" is not a supported reasoning level.`,
		);
	}

	if (catalogEntry.reasoning === "none" && input.reasoningLevel !== "none") {
		throw new AgentProfileValidationError(
			`${catalogEntry.name} does not support reasoning; use the "none" reasoning level.`,
		);
	}

	if (catalogEntry.reasoning !== "none" && input.reasoningLevel === "none") {
		throw new AgentProfileValidationError(
			`${catalogEntry.name} is a reasoning model; pick a low, medium, or high reasoning level.`,
		);
	}

	return { modelId: catalogEntry.id, reasoningLevel: input.reasoningLevel };
};

export const validateRoutine = (input: {
	instruction: string;
	name: string;
	routineId: string;
	schedule: RoutineSchedule;
}): Routine => {
	const name = normalizeText(input.name);
	const instruction = normalizeText(input.instruction);
	const routineId = normalizeText(input.routineId);

	if (!routineId) {
		throw new AgentProfileValidationError("A Routine needs a stable identifier.");
	}

	if (!name) {
		throw new AgentProfileValidationError("A Routine needs a name.");
	}

	if (!instruction) {
		throw new AgentProfileValidationError("A Routine needs a recurring instruction.");
	}

	assertMaxLength("Routine name", name, ROUTINE_NAME_MAX_LENGTH);
	assertMaxLength("Routine instruction", instruction, ROUTINE_INSTRUCTION_MAX_LENGTH);

	if (input.schedule.kind === "cron") {
		const expression = normalizeText(input.schedule.expression);

		if (!expression) {
			throw new AgentProfileValidationError("A cron Routine schedule needs an expression.");
		}

		assertMaxLength("Routine schedule", expression, ROUTINE_SCHEDULE_MAX_LENGTH);

		return { instruction, name, routineId, schedule: { expression, kind: "cron" } };
	}

	const description = normalizeText(input.schedule.description);

	if (!description) {
		throw new AgentProfileValidationError(
			"A natural-language Routine schedule needs a description.",
		);
	}

	assertMaxLength("Routine schedule", description, ROUTINE_SCHEDULE_MAX_LENGTH);

	return { instruction, name, routineId, schedule: { description, kind: "natural_language" } };
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value);

const isNonEmptyString = (value: unknown): value is string =>
	typeof value === "string" && value.length > 0;

const isToolEnablement = (value: unknown): value is ToolEnablement =>
	isRecord(value) &&
	TOOL_ENABLEMENT_SOURCES.includes(value.source as ToolEnablementSource) &&
	isNonEmptyString(value.toolId);

const isSkillReference = (value: unknown): value is SkillReference =>
	isRecord(value) && isNonEmptyString(value.skillId);

const isRoutineSchedule = (value: unknown): value is RoutineSchedule => {
	if (!isRecord(value)) {
		return false;
	}

	if (value.kind === "cron") {
		return isNonEmptyString(value.expression);
	}

	return value.kind === "natural_language" && isNonEmptyString(value.description);
};

const isRoutine = (value: unknown): value is Routine =>
	isRecord(value) &&
	isNonEmptyString(value.routineId) &&
	isNonEmptyString(value.name) &&
	isNonEmptyString(value.instruction) &&
	isRoutineSchedule(value.schedule);

const isMcpToolAccessScope = (value: unknown): value is McpToolAccessScope => {
	if (!isRecord(value)) {
		return false;
	}

	if (value.type === "server") {
		return true;
	}

	return value.type === "tool" && isNonEmptyString(value.toolName);
};

const isMcpToolAccessPermissionRequest = (
	value: unknown,
): value is McpToolAccessPermissionRequest =>
	isRecord(value) &&
	value.kind === "mcp_tool_access" &&
	isNonEmptyString(value.serverId) &&
	MCP_TOOL_ACCESS_REQUEST_RISKS.includes(value.risk as McpToolAccessRequestRisk) &&
	isMcpToolAccessScope(value.scope) &&
	typeof value.reason === "string";

const isBuiltInToolAccessPermissionRequest = (
	value: unknown,
): value is BuiltInToolAccessPermissionRequest =>
	isRecord(value) &&
	BUILT_IN_TOOL_PERMISSION_REQUEST_KINDS.includes(value.kind as BuiltInToolPermissionRequestKind) &&
	typeof value.reason === "string";

const isRequestedPermission = (value: unknown): value is RequestedPermission =>
	(isRecord(value) &&
		value.kind === "model_provider_credential" &&
		MODEL_PROVIDER_IDS.includes(value.providerId as ModelProviderId) &&
		typeof value.reason === "string") ||
	isMcpToolAccessPermissionRequest(value) ||
	isBuiltInToolAccessPermissionRequest(value);

const parseJsonArray = <T>(
	label: string,
	raw: string,
	guard: (value: unknown) => value is T,
): T[] => {
	let parsed: unknown;

	try {
		parsed = JSON.parse(raw);
	} catch {
		throw new AgentProfileValidationError(`Stored Agent Profile ${label} is not valid JSON.`);
	}

	if (!Array.isArray(parsed)) {
		throw new AgentProfileValidationError(`Stored Agent Profile ${label} must be a JSON array.`);
	}

	for (const entry of parsed) {
		if (!guard(entry)) {
			throw new AgentProfileValidationError(
				`Stored Agent Profile ${label} contains an invalid entry.`,
			);
		}
	}

	return parsed as T[];
};

const isCatalogModelId = (value: string): value is CatalogModelId =>
	MODEL_PROVIDER_IDS.some((providerId) => value.startsWith(`${providerId}:`));

/**
 * Edge parser: a stored row is not domain data yet. Corrupt payloads fail
 * with typed validation errors instead of leaking into turn assembly.
 */
export const parseAgentProfileRevision = (row: ThinkspaceAgentProfile): AgentProfileRevision => {
	if (!isAgentProfileReasoningLevel(row.reasoningLevel)) {
		throw new AgentProfileValidationError(
			"Stored Agent Profile revision has an unsupported reasoning level.",
		);
	}

	if (!isCatalogModelId(row.modelId)) {
		throw new AgentProfileValidationError(
			"Stored Agent Profile revision has an unrecognized model id.",
		);
	}

	const base: AgentProfileRevisionBase = {
		createdAt: row.createdAt,
		id: row.id,
		identity: { displayName: row.displayName, instructions: row.instructions },
		modelBehavior: { modelId: row.modelId, reasoningLevel: row.reasoningLevel },
		routines: parseJsonArray("routines", row.routines, isRoutine),
		skillReferences: parseJsonArray("skill references", row.skillReferences, isSkillReference),
		thinkspaceId: row.thinkspaceId,
		toolEnablements: parseJsonArray("tool enablements", row.toolEnablements, isToolEnablement),
		updatedAt: row.updatedAt,
		version: row.version,
	};

	if (row.status === AGENT_PROFILE_REVISION_STATUS.DRAFT) {
		return {
			...base,
			requestedPermissions: parseJsonArray(
				"requested Permissions",
				row.requestedPermissions,
				isRequestedPermission,
			),
			status: AGENT_PROFILE_REVISION_STATUS.DRAFT,
		};
	}

	if (row.status === AGENT_PROFILE_REVISION_STATUS.ACTIVE) {
		if (!row.activatedAt) {
			throw new AgentProfileValidationError(
				"Stored active Agent Profile revision is missing its activation time.",
			);
		}

		return { ...base, activatedAt: row.activatedAt, status: AGENT_PROFILE_REVISION_STATUS.ACTIVE };
	}

	if (row.status === AGENT_PROFILE_REVISION_STATUS.SUPERSEDED) {
		if (!(row.activatedAt && row.supersededAt)) {
			throw new AgentProfileValidationError(
				"Stored superseded Agent Profile revision is missing lifecycle timestamps.",
			);
		}

		return {
			...base,
			activatedAt: row.activatedAt,
			status: AGENT_PROFILE_REVISION_STATUS.SUPERSEDED,
			supersededAt: row.supersededAt,
		};
	}

	throw new AgentProfileValidationError(
		"Stored Agent Profile revision has an unknown lifecycle status.",
	);
};

/** Domain -> row mapping for persistence through the repository adapter. */
export const serializeAgentProfileRevision = (
	revision: AgentProfileRevision,
): NewThinkspaceAgentProfile => ({
	activatedAt:
		revision.status === AGENT_PROFILE_REVISION_STATUS.DRAFT ? null : revision.activatedAt,
	createdAt: revision.createdAt,
	displayName: revision.identity.displayName,
	id: revision.id,
	instructions: revision.identity.instructions,
	modelId: revision.modelBehavior.modelId,
	reasoningLevel: revision.modelBehavior.reasoningLevel,
	requestedPermissions: JSON.stringify(
		revision.status === AGENT_PROFILE_REVISION_STATUS.DRAFT ? revision.requestedPermissions : [],
	),
	routines: JSON.stringify(revision.routines),
	skillReferences: JSON.stringify(revision.skillReferences),
	status: revision.status,
	supersededAt:
		revision.status === AGENT_PROFILE_REVISION_STATUS.SUPERSEDED ? revision.supersededAt : null,
	thinkspaceId: revision.thinkspaceId,
	toolEnablements: JSON.stringify(revision.toolEnablements),
	updatedAt: revision.updatedAt,
	version: revision.version,
});
