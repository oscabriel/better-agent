import { buildCuratorCardProjection } from "@better-agent/api/thinkspaces/curator-card";
import type {
	CuratorCardProjection,
	CuratorCardRequestedPermissionView,
} from "@better-agent/api/thinkspaces/curator-card";
import { env } from "@better-agent/env/web";
import { Button } from "@better-agent/ui/components/button";
import { Switch } from "@better-agent/ui/components/switch";
import { Textarea } from "@better-agent/ui/components/textarea";
import { useAgentChat } from "@cloudflare/ai-chat/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, getRouteApi, Link, useNavigate } from "@tanstack/react-router";
import { useAgent } from "agents/react";
import {
	ArrowUpIcon,
	ChevronRightIcon,
	KeyRoundIcon,
	PlugIcon,
	SparklesIcon,
	TriangleAlertIcon,
} from "lucide-react";
import type { FormEvent } from "react";
import { useEffect, useRef, useState } from "react";

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

/** A renderable message part, narrowed to the text/reasoning the transcript shows. */
interface RenderablePart {
	kind: string;
	text: string;
}

/**
 * Grounded starter prompts (PRODUCT.md voice: name the outcome, no aspiration).
 * Seed the composer so a blank conversation teaches what to say instead of
 * staring back at the owner.
 */
const SUGGESTION_PROMPTS: readonly string[] = [
	"A research agent that tracks a competitor's pricing pages and flags changes I should review.",
	"An agent that reviews my ADRs against our coding standards and proposes GitHub issues for gaps.",
	"A weekly digest agent that reads my Sources and writes a short brief of what changed.",
];

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

const toRenderableParts = (parts: { text?: string; type: string }[]): RenderablePart[] =>
	parts
		.filter((part) => part.type === "text" || part.type === "reasoning")
		.map((part) => ({ kind: part.type, text: part.text ?? "" }));

const getLiveIndicatorLabel = (isRecovering: boolean, status: string): string => {
	if (isRecovering) {
		return "Recovering the Curator's turn…";
	}

	return status === "streaming" ? "Curator is responding…" : "Curator is thinking…";
};

/** The Curator's identity glyph — a calm achromatic disc, not a colored avatar. */
const CuratorAvatar = () => (
	<span className="grid size-6 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground">
		<SparklesIcon aria-hidden className="size-3.5" />
	</span>
);

const CuratorTurn = ({ messageId, parts }: { messageId: string; parts: RenderablePart[] }) => (
	<div className="grid gap-2">
		<div className="flex items-center gap-2">
			<CuratorAvatar />
			<p className="text-muted-foreground text-xs font-medium">Curator</p>
		</div>
		<div className="grid gap-2 pl-8">
			{parts.map((part, index) =>
				part.kind === "reasoning" ? (
					<p
						className="whitespace-pre-wrap border-border border-l pl-3 text-muted-foreground text-xs italic leading-relaxed"
						key={`${messageId}-${index}`}
					>
						{part.text}
					</p>
				) : (
					<p
						className="whitespace-pre-wrap text-sm leading-relaxed text-pretty"
						key={`${messageId}-${index}`}
					>
						{part.text}
					</p>
				),
			)}
		</div>
	</div>
);

const UserTurn = ({ messageId, parts }: { messageId: string; parts: RenderablePart[] }) => (
	<div className="flex justify-end">
		<div className="grid max-w-[85%] gap-1 rounded-lg rounded-br-sm bg-muted px-3.5 py-2.5">
			{parts.map((part, index) => (
				<p className="whitespace-pre-wrap text-sm leading-relaxed" key={`${messageId}-${index}`}>
					{part.text}
				</p>
			))}
		</div>
	</div>
);

/** Left-aligned live indicator: a pulsing disc the moment the Curator is working. */
const ThinkingIndicator = ({ label }: { label: string }) => (
	<div className="flex items-center gap-2">
		<CuratorAvatar />
		<span className="flex items-center gap-2 text-muted-foreground text-xs">
			<span className="relative flex size-1.5" aria-hidden>
				<span className="absolute inline-flex size-full animate-ping rounded-full bg-muted-foreground/60 motion-reduce:hidden" />
				<span className="relative inline-flex size-1.5 rounded-full bg-muted-foreground" />
			</span>
			{label}
		</span>
	</div>
);

const ConversationEmptyState = ({ onPick }: { onPick: (prompt: string) => void }) => (
	<div className="grid gap-6 py-10 text-center sm:py-16">
		<div className="mx-auto grid size-12 place-items-center rounded-full bg-muted">
			<SparklesIcon aria-hidden className="size-5 text-muted-foreground" />
		</div>
		<div className="grid gap-2">
			<h2 className="text-base font-semibold tracking-tight">Describe the agent you want</h2>
			<p className="mx-auto max-w-md text-muted-foreground text-sm leading-relaxed text-pretty">
				Tell the Curator the Goal, what it should pay attention to, and which Sources and tools it
				should use. It shapes the agent card beside this conversation as you talk; you grant
				Permissions and activate when it&apos;s ready.
			</p>
		</div>
		<div className="grid gap-2">
			<p className="text-muted-foreground text-xs font-medium">Try starting with</p>
			<div className="mx-auto grid w-full max-w-md gap-2">
				{SUGGESTION_PROMPTS.map((prompt) => (
					<button
						className="group flex items-start gap-2 rounded-lg px-3.5 py-2.5 text-left text-muted-foreground text-sm leading-relaxed ring-1 ring-foreground/10 transition-colors hover:bg-muted hover:text-foreground"
						key={prompt}
						onClick={() => onPick(prompt)}
						type="button"
					>
						<ArrowUpIcon
							aria-hidden
							className="mt-0.5 size-3.5 shrink-0 -rotate-45 text-muted-foreground/60 transition-colors group-hover:text-foreground"
						/>
						<span>{prompt}</span>
					</button>
				))}
			</div>
		</div>
	</div>
);

const LiveCuration = ({ agent }: { agent: CuratorAgentConnection }) => {
	const { error, isRecovering, messages, sendMessage, status, stop } = useAgentChat({
		agent,
		credentials: "include",
	});
	const [draft, setDraft] = useState("");
	const scrollRef = useRef<HTMLDivElement>(null);
	const textareaRef = useRef<HTMLTextAreaElement>(null);
	const isBusy = status === "submitted" || status === "streaming";

	// Follow the transcript as turns arrive and tokens stream, honoring reduced
	// motion. Keyed on messages + status so it tracks both new turns and streaming.
	useEffect(() => {
		const node = scrollRef.current;

		if (!node) {
			return;
		}

		const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
		node.scrollTo({ behavior: prefersReduced ? "auto" : "smooth", top: node.scrollHeight });
	}, [messages, status]);

	const applySuggestion = (prompt: string) => {
		setDraft(prompt);
		textareaRef.current?.focus();
	};

	const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		const text = draft.trim();

		if (!text || isBusy) {
			return;
		}

		setDraft("");
		void sendMessage({ text });
	};

	const liveLabel = getLiveIndicatorLabel(isRecovering, status);
	const showLiveIndicator = isBusy || isRecovering;

	return (
		<div className="flex flex-col lg:min-h-0 lg:border-border lg:border-r">
			<div
				aria-label="Curation conversation"
				aria-live="polite"
				className="overflow-y-auto px-4 py-6 lg:min-h-0 lg:flex-1 lg:px-8"
				ref={scrollRef}
			>
				<div className="mx-auto grid max-w-2xl gap-6">
					{messages.length === 0 ? (
						<ConversationEmptyState onPick={applySuggestion} />
					) : (
						messages.map((message) => {
							const parts = toRenderableParts(message.parts);

							// Curator tools are propose-only writes to the draft — the card reflects
							// them — so a turn with only tool parts shows nothing here. Skip it; the
							// live indicator below already signals an in-flight turn.
							if (parts.length === 0) {
								return null;
							}

							return message.role === "user" ? (
								<UserTurn key={message.id} messageId={message.id} parts={parts} />
							) : (
								<CuratorTurn key={message.id} messageId={message.id} parts={parts} />
							);
						})
					)}
					{showLiveIndicator ? <ThinkingIndicator label={liveLabel} /> : null}
				</div>
			</div>

			<div className="shrink-0 border-border border-t bg-background px-4 py-3 lg:px-8">
				<div className="mx-auto grid max-w-2xl gap-2">
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
							ref={textareaRef}
							rows={2}
							value={draft}
						/>
						<div className="flex items-center justify-between gap-3">
							<p className="text-muted-foreground text-xs">
								Press <kbd className="font-sans font-medium text-foreground">⌘↵</kbd> to send
							</p>
							<div className="flex items-center gap-2">
								{isBusy ? (
									<Button onClick={() => void stop()} type="button" variant="outline">
										Stop
									</Button>
								) : null}
								<Button disabled={!draft.trim() || isBusy} type="submit">
									<ArrowUpIcon />
									Send
								</Button>
							</div>
						</div>
					</form>
				</div>
			</div>
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
		<div className="flex flex-col lg:h-full lg:overflow-hidden">
			<header className="shrink-0 border-border border-b px-4 py-4 lg:px-8">
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
				<div className="mt-2 flex items-center gap-2.5">
					<SparklesIcon aria-hidden className="size-5 shrink-0 text-muted-foreground" />
					<h1 className="text-lg font-semibold tracking-tight">Create a Thinkspace</h1>
				</div>
			</header>

			<div className="grid flex-1 grid-cols-1 lg:min-h-0 lg:grid-cols-[2fr_1fr]">
				<LiveCuration agent={agent} />
				<aside className="border-border border-t px-4 py-5 lg:min-h-0 lg:overflow-y-auto lg:border-t-0 lg:px-6">
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
				</aside>
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
