import { Badge } from "@better-agent/ui/components/badge";
import { Button } from "@better-agent/ui/components/button";
import { Input } from "@better-agent/ui/components/input";
import { Label } from "@better-agent/ui/components/label";
import { Textarea } from "@better-agent/ui/components/textarea";
import { cn } from "@better-agent/ui/lib/utils";
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, getRouteApi, Link } from "@tanstack/react-router";
import {
	ArchiveIcon,
	CircleDashedIcon,
	CircleDotIcon,
	ClockIcon,
	PlusIcon,
	SearchIcon,
	TargetIcon,
} from "lucide-react";
import type { FormEvent } from "react";
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
	const queryClient = useQueryClient();
	const thinkspacesQuery = useSuspenseQuery(context.orpc.thinkspaces.list.queryOptions());
	const [goal, setGoal] = useState("");
	const [initialInstructions, setInitialInstructions] = useState("");
	const [configurationSummary, setConfigurationSummary] = useState("");
	const [showCreate, setShowCreate] = useState(false);
	const [search, setSearch] = useState("");
	const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
	const createMutation = useMutation(
		context.orpc.thinkspaces.create.mutationOptions({
			onSuccess: async () => {
				setGoal("");
				setInitialInstructions("");
				setConfigurationSummary("");
				setShowCreate(false);
				await queryClient.invalidateQueries({
					queryKey: context.orpc.thinkspaces.list.queryKey(),
				});
			},
		}),
	);

	const trimmedGoal = goal.trim();
	const trimmedConfigurationSummary = configurationSummary.trim();
	const canCreate =
		Boolean(trimmedGoal && trimmedConfigurationSummary) && !createMutation.isPending;

	const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();

		if (!canCreate) {
			return;
		}

		createMutation.mutate({
			configurationSummary,
			goal,
			initialInstructions,
		});
	};

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

			{showCreate ? (
				<form
					className="grid gap-4 rounded-lg p-6 ring-1 ring-foreground/10"
					onSubmit={handleSubmit}
				>
					<div className="grid gap-1">
						<h2 className="text-lg font-semibold tracking-tight">Create Thinkspace</h2>
						<p className="text-muted-foreground text-sm">
							Define a bounded Goal and initial configuration.
						</p>
					</div>
					<div className="grid gap-1.5">
						<Label htmlFor="thinkspace-goal">Goal</Label>
						<Input
							id="thinkspace-goal"
							name="goal"
							onChange={(event) => setGoal(event.target.value)}
							placeholder="The bounded outcome this Thinkspace will pursue"
							required
							value={goal}
						/>
					</div>
					<div className="grid gap-1.5">
						<Label htmlFor="thinkspace-configuration-summary">Configuration summary</Label>
						<Textarea
							id="thinkspace-configuration-summary"
							name="configurationSummary"
							onChange={(event) => setConfigurationSummary(event.target.value)}
							placeholder="Scope, Sources to consider, and review expectations"
							required
							rows={4}
							value={configurationSummary}
						/>
					</div>
					<div className="grid gap-1.5">
						<Label htmlFor="thinkspace-initial-instructions">Initial instructions</Label>
						<Textarea
							id="thinkspace-initial-instructions"
							name="initialInstructions"
							onChange={(event) => setInitialInstructions(event.target.value)}
							placeholder="Starting guidance for the Thinkspace Agent (optional)"
							rows={3}
							value={initialInstructions}
						/>
					</div>
					{createMutation.error ? (
						<p className="text-destructive text-sm" role="alert">
							{createMutation.error.message}
						</p>
					) : null}
					<div className="flex gap-2">
						<Button disabled={!canCreate} type="submit">
							{createMutation.isPending ? "Creating…" : "Create Thinkspace"}
						</Button>
						<Button onClick={() => setShowCreate(false)} type="button" variant="ghost">
							Cancel
						</Button>
					</div>
				</form>
			) : null}

			{!showCreate && hasThinkspaces ? (
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
						<Button className="ml-auto shrink-0" onClick={() => setShowCreate(true)}>
							<PlusIcon />
							New Thinkspace
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

			{!showCreate && !hasThinkspaces ? (
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
							a dedicated agent. Compose it once, then return to review what it produced.
						</p>
						<div>
							<Button onClick={() => setShowCreate(true)}>
								<PlusIcon />
								Create Thinkspace
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
			) : null}
		</div>
	);
};

export const Route = createFileRoute("/thinkspaces/")({
	component: RouteComponent,
	loader: async ({ context }) =>
		await context.queryClient.ensureQueryData(context.orpc.thinkspaces.list.queryOptions()),
});
