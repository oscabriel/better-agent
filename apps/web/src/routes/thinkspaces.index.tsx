import { Button } from "@better-agent/ui/components/button";
import { Input } from "@better-agent/ui/components/input";
import { Label } from "@better-agent/ui/components/label";
import { Textarea } from "@better-agent/ui/components/textarea";
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, getRouteApi, Link } from "@tanstack/react-router";
import { useState } from "react";
import type { FormEvent } from "react";

const routeApi = getRouteApi("/thinkspaces/");

const dateFormatter = new Intl.DateTimeFormat("en", {
	dateStyle: "medium",
	timeStyle: "short",
});

const formatUpdatedAt = (value: Date | number | string): string =>
	dateFormatter.format(new Date(value));

const RouteComponent = () => {
	const context = routeApi.useRouteContext();
	const queryClient = useQueryClient();
	const thinkspacesQuery = useSuspenseQuery(context.orpc.thinkspaces.list.queryOptions());
	const [goal, setGoal] = useState("");
	const [initialInstructions, setInitialInstructions] = useState("");
	const [configurationSummary, setConfigurationSummary] = useState("");
	const [showCreate, setShowCreate] = useState(false);
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

	const hasThinkspaces = thinkspacesQuery.data.length > 0;
	const shouldShowCreate = showCreate || !hasThinkspaces;

	return (
		<div className="mx-auto grid w-full max-w-3xl gap-8 px-4 py-8">
			<div className="flex items-start justify-between gap-4">
				<div className="grid gap-2">
					<h1 className="text-2xl font-semibold tracking-tight">Thinkspaces</h1>
					<p className="max-w-lg text-muted-foreground text-sm leading-relaxed">
						Each Thinkspace holds one bounded Goal with its own Permissions, Sources, Memory, and
						Artifacts.
					</p>
				</div>
				{hasThinkspaces && !showCreate ? (
					<Button className="shrink-0" onClick={() => setShowCreate(true)}>
						Create Thinkspace
					</Button>
				) : null}
			</div>

			{shouldShowCreate ? (
				<form className="grid gap-4 border border-border p-6" onSubmit={handleSubmit}>
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
						{hasThinkspaces ? (
							<Button onClick={() => setShowCreate(false)} type="button" variant="ghost">
								Cancel
							</Button>
						) : null}
					</div>
				</form>
			) : null}

			<section aria-labelledby="thinkspace-list-heading">
				<h2 className="sr-only" id="thinkspace-list-heading">
					Your Thinkspaces
				</h2>

				{!hasThinkspaces ? (
					<div className="border border-border p-6 text-center">
						<p className="text-muted-foreground text-sm">
							No Thinkspaces yet. Create one above to get started.
						</p>
					</div>
				) : (
					<div className="border border-border">
						{thinkspacesQuery.data.map((thinkspace, index) => (
							<Link
								key={thinkspace.id}
								className={`grid gap-1 p-4 transition-colors hover:bg-muted/50 ${index < thinkspacesQuery.data.length - 1 ? "border-b border-border" : ""}`}
								params={{ thinkspaceId: thinkspace.id }}
								to="/thinkspaces/$thinkspaceId"
							>
								<div className="flex items-start justify-between gap-4">
									<p className="text-sm font-medium">{thinkspace.goal}</p>
									<span className="shrink-0 text-muted-foreground text-xs capitalize">
										{thinkspace.status}
									</span>
								</div>
								<p className="line-clamp-2 text-muted-foreground text-sm">
									{thinkspace.configurationSummary}
								</p>
								<p className="text-muted-foreground text-xs">
									Updated {formatUpdatedAt(thinkspace.updatedAt)}
								</p>
							</Link>
						))}
					</div>
				)}
			</section>
		</div>
	);
};

export const Route = createFileRoute("/thinkspaces/")({
	component: RouteComponent,
	loader: async ({ context }) =>
		await context.queryClient.ensureQueryData(context.orpc.thinkspaces.list.queryOptions()),
});
