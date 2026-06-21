import { Badge } from "@better-agent/ui/components/badge";
import { Button } from "@better-agent/ui/components/button";
import { Input } from "@better-agent/ui/components/input";
import { cn } from "@better-agent/ui/lib/utils";
import { useMutation, useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, getRouteApi, Link, useNavigate } from "@tanstack/react-router";
import {
	ArchiveIcon,
	CircleDashedIcon,
	CircleDotIcon,
	ClockIcon,
	KeyRoundIcon,
	PlusIcon,
	SearchIcon,
	TargetIcon,
} from "lucide-react";
import { useState } from "react";

const routeApi = getRouteApi("/thinkspaces/");

const dateFormatter = new Intl.DateTimeFormat("en", {
	dateStyle: "medium",
});

const formatUpdatedAt = (value: Date | number | string): string =>
	dateFormatter.format(new Date(value));

// Active reads affirmative (sage); a draft is neutral; archived is attention.
const getStatusBadgeVariant = (status: string): "destructive" | "outline" | "sage" => {
	if (status === "archived") {
		return "destructive";
	}

	if (status === "draft") {
		return "outline";
	}

	return "sage";
};

// Status pills lead with a glyph so the state reads at a glance (DESIGN.md §7).
const renderStatusBadgeIcon = (status: string) => {
	if (status === "archived") {
		return <ArchiveIcon aria-hidden />;
	}

	if (status === "draft") {
		return <CircleDashedIcon aria-hidden />;
	}

	return <CircleDotIcon aria-hidden />;
};

const STATUS_FILTERS = [
	{ label: "All", value: "all" },
	{ label: "Active", value: "active" },
	{ label: "Draft", value: "draft" },
	{ label: "Archived", value: "archived" },
] as const;

type StatusFilter = (typeof STATUS_FILTERS)[number]["value"];

// The empty state teaches the populated card's anatomy. These ghosts mirror the
// real grid item: Goal-icon + name, a status pill, and quiet body lines.
const GHOST_THINKSPACES = [
	{ status: "Active", title: "Monitor Cloudflare Agents SDK releases" },
	{ status: "Draft", title: "Reimagine the onboarding flow" },
] as const;

const RouteComponent = () => {
	const context = routeApi.useRouteContext();
	const navigate = useNavigate();
	const thinkspacesQuery = useSuspenseQuery(context.orpc.thinkspaces.list.queryOptions());
	const readinessQuery = useQuery(context.orpc.models.getCuratorReadiness.queryOptions());
	const [showGate, setShowGate] = useState(false);
	const [search, setSearch] = useState("");
	const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
	// Minting a Thinkspace now opens a conversational creation surface: start a
	// curation draft, then route to it by id. The 3-field form is gone.
	const startCurationMutation = useMutation(
		context.orpc.thinkspaces.startCuration.mutationOptions({
			onSuccess: async (draft) => {
				if (!draft) {
					return;
				}

				await navigate({
					params: { draftThinkspaceId: draft.id },
					to: "/thinkspaces/create/$draftThinkspaceId",
				});
			},
		}),
	);

	const readiness = readinessQuery.data;
	const isStarting = startCurationMutation.isPending;
	const startDisabled = isStarting || readinessQuery.isLoading;

	// No credential → gate creation with a connect-first prompt, never a form. A
	// missing credential is a not-ready readiness; everything else proceeds.
	const handleStartCuration = () => {
		if (startDisabled) {
			return;
		}

		if (readiness?.status !== "ready") {
			setShowGate(true);
			return;
		}

		setShowGate(false);
		startCurationMutation.mutate({});
	};

	const gateMessage =
		readiness?.status === "not_ready"
			? readiness.message
			: "Connect a model provider credential before starting a curation conversation with the Curator.";

	const thinkspaces = thinkspacesQuery.data;
	const hasThinkspaces = thinkspaces.length > 0;
	const query = search.trim().toLowerCase();
	const filteredThinkspaces = thinkspaces.filter((thinkspace) => {
		const matchesStatus = statusFilter === "all" || thinkspace.status === statusFilter;
		const matchesQuery =
			!query ||
			thinkspace.goal.toLowerCase().includes(query) ||
			(thinkspace.configurationSummary ?? "").toLowerCase().includes(query);

		return matchesStatus && matchesQuery;
	});

	return (
		<div className="mx-auto grid w-full max-w-3xl gap-8 px-4 py-8">
			<div className="grid gap-2">
				<h1 className="text-2xl font-semibold tracking-tight">Thinkspaces</h1>
				<p className="max-w-lg text-muted-foreground text-sm leading-relaxed text-pretty">
					Each Thinkspace holds one bounded Goal with its own Permissions, Sources, Memory, and
					Artifacts.
				</p>
			</div>

			{showGate ? (
				<section
					aria-labelledby="curator-gate-heading"
					className="grid gap-4 rounded-lg p-6 ring-1 ring-foreground/10"
				>
					<div className="flex items-start gap-2.5">
						<KeyRoundIcon aria-hidden className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
						<div className="grid gap-1">
							<h2 className="text-lg font-semibold tracking-tight" id="curator-gate-heading">
								Connect a model provider first
							</h2>
							<p className="max-w-lg text-muted-foreground text-sm leading-relaxed text-pretty">
								{gateMessage}
							</p>
						</div>
					</div>
					<div className="flex gap-2">
						<Button render={<Link to="/settings/product" />}>Go to provider settings</Button>
						<Button onClick={() => setShowGate(false)} type="button" variant="ghost">
							Dismiss
						</Button>
					</div>
				</section>
			) : null}

			{startCurationMutation.error ? (
				<p className="text-destructive text-sm" role="alert">
					{startCurationMutation.error.message}
				</p>
			) : null}

			{hasThinkspaces ? (
				<section aria-labelledby="thinkspace-list-heading" className="grid gap-4">
					<h2 className="sr-only" id="thinkspace-list-heading">
						Your Thinkspaces
					</h2>
					<div className="flex flex-wrap items-center gap-2">
						<div className="relative min-w-48 flex-1 sm:max-w-xs">
							<SearchIcon
								aria-hidden
								className="-translate-y-1/2 absolute top-1/2 left-2.5 size-3.5 text-muted-foreground"
							/>
							<Input
								aria-label="Search Thinkspaces"
								className="pl-8"
								onChange={(event) => setSearch(event.target.value)}
								placeholder="Search Thinkspaces"
								value={search}
							/>
						</div>
						<div className="flex items-center gap-0.5 rounded-md border border-border p-0.5">
							{STATUS_FILTERS.map((filter) => (
								<button
									className={cn(
										"h-7 rounded-sm px-2.5 font-medium text-xs transition-colors",
										statusFilter === filter.value
											? "bg-muted text-foreground"
											: "text-muted-foreground hover:text-foreground",
									)}
									key={filter.value}
									onClick={() => setStatusFilter(filter.value)}
									type="button"
								>
									{filter.label}
								</button>
							))}
						</div>
						<Button
							className="ml-auto shrink-0"
							disabled={startDisabled}
							onClick={handleStartCuration}
						>
							<PlusIcon />
							{isStarting ? "Starting…" : "New Thinkspace"}
						</Button>
					</div>
					{filteredThinkspaces.length === 0 ? (
						<p className="rounded-lg p-8 text-center text-muted-foreground text-sm ring-1 ring-foreground/10">
							No Thinkspaces match your search.
						</p>
					) : (
						<div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(16rem,1fr))]">
							{filteredThinkspaces.map((thinkspace) => (
								<Link
									className="group grid content-start gap-3 rounded-lg p-4 ring-1 ring-foreground/10 transition-colors hover:bg-muted/40"
									key={thinkspace.id}
									params={{ thinkspaceId: thinkspace.id }}
									to="/thinkspaces/$thinkspaceId"
								>
									<div className="flex items-start justify-between gap-3">
										<div className="flex items-start gap-2">
											<TargetIcon
												aria-hidden
												className="mt-0.5 size-4 shrink-0 text-muted-foreground"
											/>
											<p className="font-medium text-sm leading-snug">{thinkspace.goal}</p>
										</div>
										<Badge className="shrink-0" variant={getStatusBadgeVariant(thinkspace.status)}>
											{renderStatusBadgeIcon(thinkspace.status)}
											<span className="capitalize">{thinkspace.status}</span>
										</Badge>
									</div>
									<p className="line-clamp-2 text-muted-foreground text-sm">
										{thinkspace.configurationSummary}
									</p>
									<p className="flex items-center gap-1.5 text-muted-foreground text-xs">
										<ClockIcon aria-hidden className="size-3" />
										Updated {formatUpdatedAt(thinkspace.updatedAt)}
									</p>
								</Link>
							))}
						</div>
					)}
				</section>
			) : null}

			{hasThinkspaces ? null : (
				<section
					aria-labelledby="thinkspace-empty-heading"
					className="grid overflow-hidden rounded-lg ring-1 ring-foreground/10 md:grid-cols-2"
				>
					<div className="grid content-center gap-4 p-8">
						<h2 className="text-lg font-semibold tracking-tight" id="thinkspace-empty-heading">
							Set up your first Thinkspace
						</h2>
						<p className="max-w-sm text-muted-foreground text-sm leading-relaxed text-pretty">
							A Thinkspace is a bounded environment for one Goal — its own Sources, Permissions, and
							a dedicated agent. Shape it in a conversation with the Curator, then return to review
							what it produced.
						</p>
						<div>
							<Button disabled={startDisabled} onClick={handleStartCuration}>
								<PlusIcon />
								{isStarting ? "Starting…" : "Create Thinkspace"}
							</Button>
						</div>
					</div>
					<div className="relative hidden min-h-56 border-border md:block md:border-l">
						<div
							aria-hidden
							className="absolute inset-0 opacity-60 [background-image:radial-gradient(var(--border)_1px,transparent_1px)] [background-size:16px_16px]"
						/>
						<div aria-hidden className="relative grid h-full content-center gap-3 p-8">
							{GHOST_THINKSPACES.map((ghost) => (
								<div
									className="grid gap-2.5 rounded-lg bg-background/60 p-4 ring-1 ring-foreground/10"
									key={ghost.title}
								>
									<div className="flex items-center justify-between gap-3">
										<div className="flex items-center gap-2">
											<TargetIcon className="size-4 text-muted-foreground/60" />
											<span className="font-medium text-foreground/70 text-sm">{ghost.title}</span>
										</div>
										<span className="h-5 rounded-full bg-muted px-2 text-muted-foreground/70 text-xs leading-5">
											{ghost.status}
										</span>
									</div>
									<div className="h-2 w-4/5 rounded-full bg-muted" />
									<div className="flex items-center gap-1.5 text-muted-foreground/50">
										<ClockIcon className="size-3" />
										<div className="h-2 w-20 rounded-full bg-muted" />
									</div>
								</div>
							))}
						</div>
					</div>
				</section>
			)}
		</div>
	);
};

export const Route = createFileRoute("/thinkspaces/")({
	component: RouteComponent,
	loader: async ({ context }) =>
		await context.queryClient.ensureQueryData(context.orpc.thinkspaces.list.queryOptions()),
});
