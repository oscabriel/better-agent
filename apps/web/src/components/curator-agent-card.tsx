import { buildCuratorCardProjection } from "@better-agent/api/thinkspaces/curator-card";
import type {
	CuratorCardConnectedAccountView,
	CuratorCardModelProvenance,
	CuratorCardProjection,
	CuratorCardRequestedPermissionView,
	CuratorCardToolBadge,
	CuratorCardToolView,
} from "@better-agent/api/thinkspaces/curator-card";
import { env } from "@better-agent/env/web";
import { Badge } from "@better-agent/ui/components/badge";
import { Button } from "@better-agent/ui/components/button";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useAgent } from "agents/react";
import { CpuIcon, KeyRoundIcon, PlugIcon, TargetIcon, WrenchIcon } from "lucide-react";
import { useMemo } from "react";

import { orpc } from "@/utils/orpc";

/**
 * Kebab-cased Durable Object class name. With `basePath` set, the client
 * connects to the worker's authenticated Curator route directly and the worker
 * resolves the runtime by draft Thinkspace id, so this value only labels the
 * connection; it does not build the URL. Mirrors the Sitting transport.
 */
const CURATOR_AGENT_RUNTIME = "curator-agent";

const MODEL_PROVENANCE_LABEL: Record<CuratorCardModelProvenance, string> = {
	curator_set: "Curator-set",
	inherited_default: "Inherited default",
};

const TOOL_SOURCE_LABEL: Record<CuratorCardToolView["source"], string> = {
	built_in: "Built-in tool",
	connected_account: "Connected Account tool",
	local_node: "Local Node tool",
	mcp_server: "External information source",
};

const TOOL_BADGE: Record<CuratorCardToolBadge, { label: string; variant: "outline" | "sage" }> = {
	// No tool is potent on enablement alone today, so this reads "Read-only"
	// forward-looking; the live axis the card surfaces is "Needs Permission".
	enablement_only: { label: "Read-only", variant: "sage" },
	needs_permission: { label: "Needs Permission", variant: "outline" },
};

const CardField = ({ children, label }: { children: React.ReactNode; label: string }) => (
	<div className="grid gap-1 border-border border-t pt-4">
		<p className="text-muted-foreground text-xs font-medium">{label}</p>
		{children}
	</div>
);

const ToolRow = ({ tool }: { tool: CuratorCardToolView }) => {
	const badge = TOOL_BADGE[tool.badge];

	return (
		<div className="flex items-center justify-between gap-4 p-4">
			<div className="grid gap-0.5">
				<p className="break-all text-sm font-medium">{tool.toolId}</p>
				<p className="text-muted-foreground text-xs">{TOOL_SOURCE_LABEL[tool.source]}</p>
			</div>
			<Badge variant={badge.variant}>{badge.label}</Badge>
		</div>
	);
};

const PermissionRow = ({ permission }: { permission: CuratorCardRequestedPermissionView }) => (
	<div className="grid gap-0.5 p-4">
		<p className="text-sm font-medium">{permission.label}</p>
		<p className="text-muted-foreground text-xs">{permission.reason}</p>
	</div>
);

const ConnectedAccountRow = ({ account }: { account: CuratorCardConnectedAccountView }) => (
	<div className="flex items-center justify-between gap-4 p-4">
		<div className="grid gap-0.5">
			<p className="text-sm font-medium capitalize">{account.catalogId}</p>
			<p className="text-muted-foreground text-xs">
				{account.connected
					? `Connected as ${account.accountLabel ?? account.catalogId}`
					: "Not connected — the tool stays inert until you connect an account."}
			</p>
		</div>
		{account.connected ? (
			<Badge variant="sage">Connected</Badge>
		) : (
			<Button render={<Link to="/settings/product" />} size="sm" variant="outline">
				<PlugIcon />
				Connect
			</Button>
		)}
	</div>
);

const ListPanel = ({
	children,
	count,
	emptyMessage,
}: {
	children: React.ReactNode;
	count: number;
	emptyMessage: string;
}) =>
	count === 0 ? (
		<p className="rounded-lg p-4 ring-1 ring-foreground/10 text-muted-foreground text-sm">
			{emptyMessage}
		</p>
	) : (
		<div className="divide-y divide-border overflow-hidden rounded-lg ring-1 ring-foreground/10">
			{children}
		</div>
	);

/**
 * The presentational agent card. Pure render over a {@link CuratorCardProjection}
 * with no transport of its own, so the creation surface (#129) can own one shared
 * `useAgent` connection and feed both the chat and this card from it.
 * `showRequestedPermissions` is `false` when the surface renders the requested
 * Permissions as interactive grant toggles in its Activate step instead, so the
 * same list never appears twice.
 */
export const CuratorAgentCardBody = ({
	card,
	showRequestedPermissions = true,
}: {
	card: CuratorCardProjection;
	showRequestedPermissions?: boolean;
}) => (
	<div className="grid gap-4 rounded-lg p-5 ring-1 ring-foreground/10">
		<div className="flex items-start justify-between gap-4">
			<div className="grid gap-1">
				<p className="text-muted-foreground text-xs font-medium">Agent</p>
				<p className="text-balance text-lg font-semibold tracking-tight">{card.displayName}</p>
			</div>
			<Badge variant={card.ready ? "sage" : "outline"}>
				{card.ready ? "Ready to activate" : "Shaping…"}
			</Badge>
		</div>

		<CardField label="Goal">
			{card.goal ? (
				<div className="flex items-start gap-2">
					<TargetIcon aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
					<p className="text-sm leading-relaxed">{card.goal}</p>
				</div>
			) : (
				<p className="text-muted-foreground text-sm">
					No Goal yet — describe what this agent should achieve.
				</p>
			)}
		</CardField>

		{card.configurationSummary ? (
			<CardField label="Configuration summary">
				<p className="text-sm leading-relaxed">{card.configurationSummary}</p>
			</CardField>
		) : null}

		<CardField label="Instructions">
			<p className="whitespace-pre-wrap text-sm leading-relaxed">
				{card.instructions || "No instructions yet."}
			</p>
		</CardField>

		<CardField label="Model">
			<div className="flex flex-wrap items-center gap-2">
				<CpuIcon aria-hidden className="size-4 text-muted-foreground" />
				<span className="break-all text-sm">{card.model.modelId}</span>
				<Badge variant="outline">{MODEL_PROVENANCE_LABEL[card.model.provenance]}</Badge>
				<span className="text-muted-foreground text-xs">
					Reasoning: {card.model.reasoningLevel}
				</span>
			</div>
		</CardField>

		<CardField label="Enabled tools">
			<div className="flex items-center gap-2 pb-1">
				<WrenchIcon aria-hidden className="size-4 text-muted-foreground" />
				<span className="text-muted-foreground text-xs">
					Enablement makes a tool present; a Permission makes it potent.
				</span>
			</div>
			<ListPanel count={card.tools.length} emptyMessage="No tools enabled yet.">
				{card.tools.map((tool) => (
					<ToolRow key={`${tool.source}:${tool.toolId}`} tool={tool} />
				))}
			</ListPanel>
		</CardField>

		{showRequestedPermissions ? (
			<CardField label="Requested Permissions">
				<div className="flex items-center gap-2 pb-1">
					<KeyRoundIcon aria-hidden className="size-4 text-muted-foreground" />
					<span className="text-muted-foreground text-xs">
						You grant these when you activate the Thinkspace.
					</span>
				</div>
				<ListPanel
					count={card.requestedPermissions.length}
					emptyMessage="No Permissions requested yet."
				>
					{card.requestedPermissions.map((permission) => (
						<PermissionRow key={`${permission.kind}:${permission.label}`} permission={permission} />
					))}
				</ListPanel>
			</CardField>
		) : null}

		{card.connectedAccounts.length > 0 ? (
			<CardField label="Connected Accounts">
				<ListPanel count={card.connectedAccounts.length} emptyMessage="">
					{card.connectedAccounts.map((account) => (
						<ConnectedAccountRow account={account} key={account.toolId} />
					))}
				</ListPanel>
			</CardField>
		) : null}
	</div>
);

/**
 * Builds the card's seed projection from the draft query — the initial-load
 * reconciliation. The same pure builder the DO uses runs here so the card has
 * content before the first synced delta arrives (and for a freshly minted draft
 * that has had no tool calls yet, whose synced state is still null). Returns
 * `null` until the draft query resolves to an actual draft revision.
 *
 * Exposed as a hook so the creation surface (#129) can share the seed: it derives
 * the live card display from it (`syncedState ?? seed`) and its Activate step
 * reads the requested Permissions from the same authoritative draft query, never
 * from the lagging synced projection. **D1 is the source of truth; synced state
 * is a projection.**
 */
export const useCuratorCardSeed = (draftThinkspaceId: string): CuratorCardProjection | null => {
	const thinkspaceQuery = useQuery(
		orpc.thinkspaces.get.queryOptions({ input: { thinkspaceId: draftThinkspaceId } }),
	);
	const connectedAccountsQuery = useQuery(orpc.connectedAccounts.list.queryOptions());
	const modelDefaultsQuery = useQuery(orpc.models.getDefaults.queryOptions());

	return useMemo<CuratorCardProjection | null>(() => {
		const thinkspace = thinkspaceQuery.data;
		const draft = thinkspace?.agentProfileRevision;

		if (!(thinkspace && draft) || draft.status !== "draft") {
			return null;
		}

		return buildCuratorCardProjection({
			connectedAccounts: connectedAccountsQuery.data ?? [],
			defaultModelId: modelDefaultsQuery.data?.defaultModel ?? draft.modelBehavior.modelId,
			draft,
			thinkspace,
		});
	}, [thinkspaceQuery.data, connectedAccountsQuery.data, modelDefaultsQuery.data]);
};

/**
 * The live agent card (#128) — the surface the creation conversation converges
 * on. It self-connects to the Curator runtime and reads its synced state
 * (`useAgent` `state`, kept in sync via `onStateUpdate`), which the DO re-projects
 * after each propose-only tool writes the draft, falling back to the seed before
 * the first delta. The creation page (#129) owns one shared `useAgent` instead and
 * renders {@link CuratorAgentCardBody} directly; this stays the standalone card.
 */
export const CuratorAgentCard = ({ draftThinkspaceId }: { draftThinkspaceId: string }) => {
	const seed = useCuratorCardSeed(draftThinkspaceId);
	const agent = useAgent<CuratorCardProjection | null>({
		agent: CURATOR_AGENT_RUNTIME,
		basePath: `api/curator/${draftThinkspaceId}`,
		host: env.VITE_SERVER_URL,
		name: draftThinkspaceId,
	});

	// Synced state wins once the runtime has projected; the seed covers the first
	// load and a fresh, never-curated draft (whose synced state is still null).
	const card = agent.state ?? seed;

	if (!card) {
		return (
			<p className="rounded-lg p-5 ring-1 ring-foreground/10 text-muted-foreground text-sm">
				Starting the curation conversation…
			</p>
		);
	}

	return <CuratorAgentCardBody card={card} />;
};
