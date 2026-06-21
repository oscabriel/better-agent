/**
 * The Curator agent-card projection (#128) — a pure view of a curation draft.
 *
 * The card is the live surface the creation conversation converges on: after
 * each Curator tool writes the draft (#127), the `CuratorAgent` re-reads it from
 * D1 and pushes the projection this builder produces into Project Think's synced
 * agent state, and the web card re-renders. **D1 stays the source of truth; this
 * projection is only a derived view, never an independent source.**
 *
 * The builder is deliberately pure and substrate-free so it is the testable seam
 * (the projection-shape gate lives against it) and so both sides of the wire can
 * share one shape: the DO calls it to broadcast live deltas, and the web client
 * calls it to seed the initial card from the draft query before the first synced
 * delta arrives. It takes a draft revision, the Thinkspace's Goal/summary, the
 * owner's Connected Accounts, and the owner's default model id; it reaches no db.
 */
import type {
	AgentProfileReasoningLevel,
	DraftAgentProfileRevision,
	RequestedPermission,
	ToolEnablementSource,
} from "./agent-profile";
import { connectedAccountCatalogIdFromToolId } from "./connected-account-tools";
import { evaluateEnablementOnlyToolPotency } from "./permission-policy";

/**
 * Whether the draft's model was chosen by the Curator (`set_model`) or is still
 * the user's inherited default. The draft does not record which tool last wrote
 * the model, so this is a heuristic: a model equal to the owner's default reads
 * as inherited. The imperfect case — the Curator re-picking the default — reads
 * as inherited too, which is the honest, non-alarming default.
 */
export type CuratorCardModelProvenance = "curator_set" | "inherited_default";

/**
 * Read-only (potent on enablement alone) vs needs-Permission (inert until the
 * owner grants the governing Permission at activation). Derived from the
 * fail-closed potency rule under no grants, not hand-classified.
 */
export type CuratorCardToolBadge = "enablement_only" | "needs_permission";

export interface CuratorCardToolView {
	badge: CuratorCardToolBadge;
	source: ToolEnablementSource;
	toolId: string;
}

export interface CuratorCardModelView {
	modelId: string;
	provenance: CuratorCardModelProvenance;
	reasoningLevel: AgentProfileReasoningLevel;
}

export interface CuratorCardRequestedPermissionView {
	kind: RequestedPermission["kind"];
	label: string;
	reason: string;
}

export interface CuratorCardConnectedAccountView {
	accountLabel: string | null;
	catalogId: string;
	connected: boolean;
	toolId: string;
}

export interface CuratorCardProjection {
	configurationSummary: string;
	connectedAccounts: CuratorCardConnectedAccountView[];
	displayName: string;
	goal: string;
	instructions: string;
	model: CuratorCardModelView;
	ready: boolean;
	requestedPermissions: CuratorCardRequestedPermissionView[];
	tools: CuratorCardToolView[];
}

/**
 * The minimal Connected Account fields the projection needs — a structural
 * subset of a `listConnectedAccounts` row, so callers pass the rows straight
 * through without the builder depending on the db schema.
 */
export interface CuratorCardConnectedAccountRecord {
	catalogId: string | null;
	externalAccountId: string | null;
	label: string | null;
}

/** The Goal and configuration summary live on the Thinkspace row, not the draft. */
export interface CuratorCardThinkspaceFields {
	configurationSummary: string;
	goal: string;
}

export interface BuildCuratorCardProjectionInput {
	connectedAccounts: readonly CuratorCardConnectedAccountRecord[];
	defaultModelId: string;
	draft: DraftAgentProfileRevision;
	thinkspace: CuratorCardThinkspaceFields;
}

const toRequestedPermissionView = (
	permission: RequestedPermission,
): CuratorCardRequestedPermissionView => {
	switch (permission.kind) {
		case "built_in_memory_write": {
			return { kind: permission.kind, label: "Memory writing", reason: permission.reason };
		}
		case "built_in_source_read": {
			return { kind: permission.kind, label: "Source reading", reason: permission.reason };
		}
		case "built_in_web_read": {
			return { kind: permission.kind, label: "Web reading", reason: permission.reason };
		}
		case "connected_account_credential": {
			return {
				kind: permission.kind,
				label: `Connected Account: ${permission.catalogId}`,
				reason: permission.reason,
			};
		}
		case "model_provider_credential": {
			return {
				kind: permission.kind,
				label: `Model credential: ${permission.providerId}`,
				reason: permission.reason,
			};
		}
		default: {
			return {
				kind: permission.kind,
				label: `External tool access: ${permission.serverId}`,
				reason: permission.reason,
			};
		}
	}
};

/**
 * Builds the agent card from a curation draft. Pure and idempotent: the same
 * inputs always yield the same projection, so it is safe to re-run after every
 * tool write and to share between the DO and the web seed.
 */
export const buildCuratorCardProjection = ({
	connectedAccounts,
	defaultModelId,
	draft,
	thinkspace,
}: BuildCuratorCardProjectionInput): CuratorCardProjection => {
	const potencyByToolId = new Map(
		evaluateEnablementOnlyToolPotency(draft.toolEnablements).map(
			(verdict) => [verdict.toolId, verdict.potency] as const,
		),
	);

	const tools: CuratorCardToolView[] = draft.toolEnablements.map((enablement) => ({
		badge:
			potencyByToolId.get(enablement.toolId) === "potent" ? "enablement_only" : "needs_permission",
		source: enablement.source,
		toolId: enablement.toolId,
	}));

	const connectedAccountViews: CuratorCardConnectedAccountView[] = draft.toolEnablements
		.filter((enablement) => enablement.source === "connected_account")
		.map((enablement) => {
			const catalogId = connectedAccountCatalogIdFromToolId(enablement.toolId);
			const account = connectedAccounts.find((candidate) => candidate.catalogId === catalogId);

			return {
				accountLabel: account ? (account.label ?? account.externalAccountId) : null,
				catalogId,
				connected: Boolean(account),
				toolId: enablement.toolId,
			};
		});

	return {
		configurationSummary: thinkspace.configurationSummary,
		connectedAccounts: connectedAccountViews,
		displayName: draft.identity.displayName,
		goal: thinkspace.goal,
		instructions: draft.identity.instructions,
		model: {
			modelId: draft.modelBehavior.modelId,
			provenance:
				draft.modelBehavior.modelId === defaultModelId ? "inherited_default" : "curator_set",
			reasoningLevel: draft.modelBehavior.reasoningLevel,
		},
		// Readiness gates the (user-only) Activate step #129 will add: a real Goal
		// plus the model-credential request the draft must carry. Whether that
		// credential actually resolves is a separate activation-time gate.
		ready:
			thinkspace.goal.trim().length > 0 &&
			draft.requestedPermissions.some(
				(permission) => permission.kind === "model_provider_credential",
			),
		requestedPermissions: draft.requestedPermissions.map(toRequestedPermissionView),
		tools,
	};
};
