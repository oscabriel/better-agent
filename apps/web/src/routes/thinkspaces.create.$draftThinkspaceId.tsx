import { buildCuratorCardProjection } from "@better-agent/api/thinkspaces/curator-card";
import type {
	CuratorCardProjection,
	CuratorCardRequestedPermissionView,
} from "@better-agent/api/thinkspaces/curator-card";
import { env } from "@better-agent/env/web";
import { Badge } from "@better-agent/ui/components/badge";
import { Button } from "@better-agent/ui/components/button";
import { Switch } from "@better-agent/ui/components/switch";
import { Textarea } from "@better-agent/ui/components/textarea";
import { useAgentChat } from "@cloudflare/ai-chat/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, getRouteApi, Link, useNavigate } from "@tanstack/react-router";
import { useAgent } from "agents/react";
import {
	ChevronRightIcon,
	KeyRoundIcon,
	MessagesSquareIcon,
	PlugIcon,
	SparklesIcon,
	TriangleAlertIcon,
} from "lucide-react";
import type { FormEvent } from "react";
import { useState } from "react";

import { CuratorAgentCardBody, useCuratorCardSeed } from "@/components/curator-agent-card";

const routeApi = getRouteApi("/thinkspaces/create/$draftThinkspaceId");

/**
 * Kebab-cased Durable Object class name. With `basePath` set, the client connects
 * to the worker's authenticated Curator route directly and the worker resolves
 * the runtime by draft Thinkspace id, so this value only labels the connection.
 * Mirrors the Sitting transport.
 */
const CURATOR_AGENT_RUNTIME = "curator-agent";

/** The shared connection both the chat and the live card read from. */
type CuratorAgentConnection = ReturnType<typeof useAgent<CuratorCardProjection | null>>;

/**
 * A stable identity for a requested Permission, used to track grant decisions
 * across the live (synced) card and the authoritative draft re-read at activation
 * time. The view label encodes each Permission's discriminator (providerId,
 * catalogId, serverId), so `kind|label` is unique within a draft regardless of
 * array position — which lets the grant set survive the projection re-ordering or
 * lagging behind the draft mid-conversation.
 */
const permissionKey = (permission: CuratorCardRequestedPermissionView): string =>
	`${permission.kind}|${permission.label}`;

const getCuratorMessageRoleLabel = (role: string): string => (role === "user" ? "You" : "Curator");

const LiveCuration = ({ agent }: { agent: CuratorAgentConnection }) => {
	const { error, isRecovering, messages, sendMessage, status, stop } = useAgentChat({
		agent,
		credentials: "include",
	});
	const [draft, setDraft] = useState("");
	const isBusy = status === "submitted" || status === "streaming";

	const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		const text = draft.trim();

		if (!text || isBusy) {
			return;
		}

		setDraft("");
		void sendMessage({ text });
	};

	return (
		<div className="grid gap-4 rounded-lg p-4 ring-1 ring-foreground/10">
			<div className="flex items-center gap-2">
				<MessagesSquareIcon aria-hidden className="size-4 text-muted-foreground" />
				<h2 className="text-sm font-medium">Curation conversation</h2>
			</div>
			<div
				aria-label="Curation conversation"
				aria-live="polite"
				className="grid max-h-[30rem] gap-4 overflow-y-auto"
			>
				{messages.length === 0 ? (
					<p className="text-muted-foreground text-sm leading-relaxed">
						Describe the agent you want — its Goal, what it should pay attention to, which Sources
						and tools it should use, and how it should work. The Curator shapes the agent card
						beside this conversation as you talk; you grant Permissions and activate when it&apos;s
						ready.
					</p>
				) : (
					messages.map((message) => {
						const renderableParts = message.parts.filter(
							(part) => part.type === "text" || part.type === "reasoning",
						);

						// Curator tools are propose-only writes to the draft — the card reflects
						// them — so a turn with only tool parts shows nothing here. Skip it; the
						// streaming/thinking badges below already signal an in-flight turn.
						if (renderableParts.length === 0) {
							return null;
						}

						return (
							<div className="grid gap-1" key={message.id}>
								<p className="text-muted-foreground text-xs font-medium">
									{getCuratorMessageRoleLabel(message.role)}
								</p>
								{renderableParts.map((part, index) => {
									if (part.type === "reasoning") {
										return (
											<p
												className="whitespace-pre-wrap border-border border-l-2 pl-3 text-muted-foreground text-xs italic leading-relaxed"
												key={`${message.id}-reasoning-${index}`}
											>
												{part.text}
											</p>
										);
									}

									return (
										<p
											className="whitespace-pre-wrap text-sm leading-relaxed"
											key={`${message.id}-text-${index}`}
										>
											{part.type === "text" ? part.text : ""}
										</p>
									);
								})}
							</div>
						);
					})
				)}
			</div>
			<div className="flex flex-wrap items-center gap-3 border-border border-t pt-3">
				{isRecovering ? (
					<Badge variant="secondary">Recovering the Curator&apos;s turn…</Badge>
				) : null}
				{status === "streaming" ? <Badge variant="secondary">Streaming…</Badge> : null}
				{status === "submitted" ? <Badge variant="secondary">Thinking…</Badge> : null}
			</div>
			{error ? (
				<p className="text-destructive text-xs" role="alert">
					{error.message}
				</p>
			) : null}
			<form className="grid gap-2" onSubmit={handleSubmit}>
				<label className="sr-only" htmlFor="curation-message">
					Message to the Curator
				</label>
				<Textarea
					id="curation-message"
					onChange={(event) => setDraft(event.target.value)}
					onKeyDown={(event) => {
						if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
							event.currentTarget.form?.requestSubmit();
						}
					}}
					placeholder="Describe the agent you want to build, or refine the card on the right."
					rows={3}
					value={draft}
				/>
				<div className="flex items-center justify-end gap-2">
					{isBusy ? (
						<Button onClick={() => void stop()} type="button" variant="outline">
							Stop
						</Button>
					) : null}
					<Button disabled={!draft.trim() || isBusy} type="submit">
						Send
					</Button>
				</div>
			</form>
		</div>
	);
};

const ActivateStep = ({
	card,
	draftThinkspaceId,
}: {
	card: CuratorCardProjection;
	draftThinkspaceId: string;
}) => {
	const context = routeApi.useRouteContext();
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	// Default is grant-all: a Permission is granted unless the owner toggles it off.
	const [deniedKeys, setDeniedKeys] = useState<ReadonlySet<string>>(new Set());
	const activateMutation = useMutation(
		context.orpc.thinkspaces.activateAgentProfile.mutationOptions({
			onSuccess: async () => {
				await queryClient.invalidateQueries({
					queryKey: context.orpc.thinkspaces.list.queryKey(),
				});
				await navigate({
					params: { thinkspaceId: draftThinkspaceId },
					to: "/thinkspaces/$thinkspaceId",
				});
			},
		}),
	);

	const { requestedPermissions } = card;
	const unconnectedAccounts = card.connectedAccounts.filter((account) => !account.connected);

	const toggleGrant = (key: string, granted: boolean) => {
		setDeniedKeys((previous) => {
			const next = new Set(previous);
			if (granted) {
				next.delete(key);
			} else {
				next.add(key);
			}
			return next;
		});
	};

	const handleActivate = async () => {
		if (!card.ready || activateMutation.isPending) {
			return;
		}

		// Re-read the draft from D1 so the grant indexes map against the server's
		// current `requestedPermissions` array, not the live projection (which can lag
		// the draft mid-conversation). The grant decision is tracked by stable key, so
		// it survives the array having grown since the toggles first rendered.
		const fresh = await queryClient.fetchQuery(
			context.orpc.thinkspaces.get.queryOptions({ input: { thinkspaceId: draftThinkspaceId } }),
		);
		const freshDraft = fresh.agentProfileRevision;

		if (!freshDraft || freshDraft.status !== "draft") {
			return;
		}

		const [connectedAccounts, modelDefaults] = await Promise.all([
			queryClient.ensureQueryData(context.orpc.connectedAccounts.list.queryOptions()),
			queryClient.ensureQueryData(context.orpc.models.getDefaults.queryOptions()),
		]);
		const freshProjection = buildCuratorCardProjection({
			connectedAccounts,
			defaultModelId: modelDefaults.defaultModel ?? freshDraft.modelBehavior.modelId,
			draft: freshDraft,
			thinkspace: fresh,
		});
		const grantedPermissionIndexes = freshProjection.requestedPermissions
			.map((permission, index) => ({ index, key: permissionKey(permission) }))
			.filter(({ key }) => !deniedKeys.has(key))
			.map(({ index }) => index);

		activateMutation.mutate({ grantedPermissionIndexes, thinkspaceId: draftThinkspaceId });
	};

	return (
		<section
			aria-labelledby="activate-heading"
			className="grid gap-4 rounded-lg p-5 ring-1 ring-foreground/10"
		>
			<div className="grid gap-1">
				<h2 className="text-sm font-medium" id="activate-heading">
					Activate
				</h2>
				<p className="text-muted-foreground text-xs leading-relaxed">
					Grant the Permissions this agent needs, then activate to make the Thinkspace live. You can
					change Permissions later from the Thinkspace.
				</p>
			</div>

			<div className="grid gap-2">
				<div className="flex items-center gap-2">
					<KeyRoundIcon aria-hidden className="size-4 text-muted-foreground" />
					<p className="text-muted-foreground text-xs">Permissions to grant on activation</p>
				</div>
				{requestedPermissions.length === 0 ? (
					<p className="rounded-lg p-4 ring-1 ring-foreground/10 text-muted-foreground text-sm">
						The Curator hasn&apos;t requested any Permissions yet.
					</p>
				) : (
					<div className="divide-y divide-border overflow-hidden rounded-lg ring-1 ring-foreground/10">
						{requestedPermissions.map((permission) => {
							const key = permissionKey(permission);
							const granted = !deniedKeys.has(key);

							return (
								<div className="flex items-start justify-between gap-4 p-4" key={key}>
									<div className="grid gap-0.5">
										<p className="text-sm font-medium">{permission.label}</p>
										<p className="text-muted-foreground text-xs">{permission.reason}</p>
									</div>
									<Switch
										aria-label={`Grant ${permission.label}`}
										checked={granted}
										disabled={activateMutation.isPending}
										onCheckedChange={(checked) => toggleGrant(key, checked)}
									/>
								</div>
							);
						})}
					</div>
				)}
			</div>

			{unconnectedAccounts.length > 0 ? (
				<div className="grid gap-2 rounded-lg p-4 ring-1 ring-foreground/10">
					{unconnectedAccounts.map((account) => (
						<div className="flex items-start justify-between gap-4" key={account.toolId}>
							<div className="flex items-start gap-2">
								<TriangleAlertIcon
									aria-hidden
									className="mt-0.5 size-4 shrink-0 text-muted-foreground"
								/>
								<p className="text-muted-foreground text-xs leading-relaxed">
									The <span className="font-medium capitalize">{account.catalogId}</span> tool stays
									inert until you connect an account. You can still activate now and connect later.
								</p>
							</div>
							<Button render={<Link to="/settings/product" />} size="sm" variant="outline">
								<PlugIcon />
								Connect
							</Button>
						</div>
					))}
				</div>
			) : null}

			{card.ready ? null : (
				<p className="text-muted-foreground text-xs">
					Give the agent a Goal and a model before activating — keep shaping it in the conversation.
				</p>
			)}

			{activateMutation.error ? (
				<p className="text-destructive text-sm" role="alert">
					{activateMutation.error.message}
				</p>
			) : null}

			<Button
				className="w-full"
				disabled={!card.ready || activateMutation.isPending}
				onClick={() => void handleActivate()}
				type="button"
			>
				<SparklesIcon />
				{activateMutation.isPending ? "Activating…" : "Activate Thinkspace"}
			</Button>
		</section>
	);
};

const RouteComponent = () => {
	const { draftThinkspaceId } = routeApi.useParams();
	const seed = useCuratorCardSeed(draftThinkspaceId);
	const agent = useAgent<CuratorCardProjection | null>({
		agent: CURATOR_AGENT_RUNTIME,
		basePath: `api/curator/${draftThinkspaceId}`,
		host: env.VITE_SERVER_URL,
		name: draftThinkspaceId,
	});

	// Synced state wins once the runtime has projected after the first propose-only
	// tool; the seed covers the first load and a fresh, never-curated draft.
	const card = agent.state ?? seed;

	return (
		<div className="mx-auto grid w-full max-w-6xl gap-6 px-4 py-8">
			<header className="grid gap-3">
				<nav
					aria-label="Breadcrumb"
					className="flex items-center gap-1.5 text-muted-foreground text-xs"
				>
					<Link className="transition-colors hover:text-foreground" to="/thinkspaces">
						Thinkspaces
					</Link>
					<ChevronRightIcon aria-hidden className="size-3.5" />
					<span aria-current="page" className="text-foreground">
						New Thinkspace
					</span>
				</nav>
				<div className="flex items-start gap-2.5">
					<SparklesIcon aria-hidden className="mt-1 size-5 shrink-0 text-muted-foreground" />
					<div className="grid gap-1">
						<h1 className="text-2xl font-semibold tracking-tight">Create a Thinkspace</h1>
						<p className="max-w-xl text-muted-foreground text-sm leading-relaxed text-pretty">
							Shape the agent through a conversation with the Curator. It proposes the Goal,
							instructions, model, tools, and Permissions on the card; you grant and activate.
						</p>
					</div>
				</div>
			</header>

			<div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_24rem]">
				<LiveCuration agent={agent} />
				<div className="grid content-start gap-4">
					{card ? (
						<>
							<CuratorAgentCardBody card={card} showRequestedPermissions={false} />
							<ActivateStep card={card} draftThinkspaceId={draftThinkspaceId} />
						</>
					) : (
						<p className="rounded-lg p-5 ring-1 ring-foreground/10 text-muted-foreground text-sm">
							Starting the curation conversation…
						</p>
					)}
				</div>
			</div>
		</div>
	);
};

export const Route = createFileRoute("/thinkspaces/create/$draftThinkspaceId")({
	component: RouteComponent,
	loader: async ({ context, params }) =>
		await context.queryClient.ensureQueryData(
			context.orpc.thinkspaces.get.queryOptions({
				input: { thinkspaceId: params.draftThinkspaceId },
			}),
		),
});
