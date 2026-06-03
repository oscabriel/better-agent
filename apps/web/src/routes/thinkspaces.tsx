import { Button } from "@better-agent/ui/components/button";
import {
	Card,
	CardAction,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@better-agent/ui/components/card";
import { Input } from "@better-agent/ui/components/input";
import { Label } from "@better-agent/ui/components/label";
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, getRouteApi, redirect } from "@tanstack/react-router";
import { useState } from "react";
import type { FormEvent } from "react";

import { getUser } from "@/functions/get-user";

const routeApi = getRouteApi("/thinkspaces");

const dateFormatter = new Intl.DateTimeFormat("en", {
	dateStyle: "medium",
	timeStyle: "short",
});

const formatUpdatedAt = (value: Date | number | string): string =>
	dateFormatter.format(new Date(value));

const RouteComponent = () => {
	const context = routeApi.useRouteContext();
	const { session } = context;
	const queryClient = useQueryClient();
	const thinkspacesQuery = useSuspenseQuery(context.orpc.thinkspaces.list.queryOptions());
	const [goal, setGoal] = useState("");
	const [initialInstructions, setInitialInstructions] = useState("");
	const [configurationSummary, setConfigurationSummary] = useState("");
	const createMutation = useMutation(
		context.orpc.thinkspaces.create.mutationOptions({
			onSuccess: async () => {
				setGoal("");
				setInitialInstructions("");
				setConfigurationSummary("");
				await queryClient.invalidateQueries({
					queryKey: context.orpc.thinkspaces.list.queryKey(),
				});
			},
		}),
	);

	const displayName = session.user.name || session.user.email || "there";
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

	return (
		<div className="mx-auto grid w-full max-w-6xl gap-6 px-4 py-8">
			<section className="grid gap-2">
				<p className="text-muted-foreground text-xs uppercase tracking-[0.24em]">Better Agent</p>
				<h1 className="text-3xl font-semibold tracking-tight">Thinkspaces</h1>
				<p className="max-w-2xl text-muted-foreground text-sm leading-6">
					Welcome back, {displayName}. Create durable Thinkspaces around bounded Goals, then return
					here when work needs your judgement.
				</p>
			</section>

			<div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
				<Card id="review-queue" className="border-primary/20 bg-primary/5">
					<CardHeader>
						<CardTitle>Review Queue</CardTitle>
						<CardDescription>
							A cross-Thinkspace set of items awaiting your judgement: pending Approvals, drafts,
							Memory to accept, and Goal assessments.
						</CardDescription>
					</CardHeader>
					<CardContent className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
						<div className="grid gap-1">
							<p className="font-medium">Nothing needs review yet.</p>
							<p className="text-muted-foreground">
								This slice creates the entry point. Runtime holdpoints will populate it later
								without turning this page into a live activity surface.
							</p>
						</div>
						<Button variant="outline" type="button" disabled>
							Review Queue empty
						</Button>
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle>Create Thinkspace</CardTitle>
						<CardDescription>
							Start with one bounded Goal and a reviewable configuration summary. Skills, tools,
							Permissions, and Approval defaults stay empty until explicitly scoped.
						</CardDescription>
					</CardHeader>
					<CardContent>
						<form className="grid gap-3" onSubmit={handleSubmit}>
							<div className="grid gap-1.5">
								<Label htmlFor="thinkspace-goal">Goal</Label>
								<Input
									id="thinkspace-goal"
									name="goal"
									onChange={(event) => setGoal(event.target.value)}
									placeholder="Define the bounded outcome"
									required
									value={goal}
								/>
							</div>
							<div className="grid gap-1.5">
								<Label htmlFor="thinkspace-configuration-summary">
									Initial configuration summary
								</Label>
								<textarea
									aria-label="Initial configuration summary"
									id="thinkspace-configuration-summary"
									name="configurationSummary"
									onChange={(event) => setConfigurationSummary(event.target.value)}
									placeholder="Summarize the initial scope, Sources to consider, and review expectations"
									required
									rows={4}
									value={configurationSummary}
									className="min-h-24 w-full rounded-none border border-input bg-transparent px-2.5 py-2 text-xs outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50"
								/>
							</div>
							<div className="grid gap-1.5">
								<Label htmlFor="thinkspace-initial-instructions">Initial instructions</Label>
								<textarea
									aria-label="Initial instructions"
									id="thinkspace-initial-instructions"
									name="initialInstructions"
									onChange={(event) => setInitialInstructions(event.target.value)}
									placeholder="Optional starting guidance for the Thinkspace Agent"
									rows={3}
									value={initialInstructions}
									className="min-h-20 w-full rounded-none border border-input bg-transparent px-2.5 py-2 text-xs outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50"
								/>
							</div>
							{createMutation.error ? (
								<p className="text-destructive text-xs" role="alert">
									{createMutation.error.message}
								</p>
							) : null}
							<Button className="w-fit" disabled={!canCreate} type="submit">
								{createMutation.isPending ? "Creating…" : "Create Thinkspace"}
							</Button>
						</form>
					</CardContent>
				</Card>
			</div>

			<section className="grid gap-3" aria-labelledby="thinkspace-list-heading">
				<div className="flex flex-wrap items-end justify-between gap-2">
					<div className="grid gap-1">
						<h2 id="thinkspace-list-heading" className="text-xl font-semibold tracking-tight">
							Your Thinkspaces
						</h2>
						<p className="text-muted-foreground text-sm">
							Only Thinkspaces owned by your account appear here.
						</p>
					</div>
				</div>

				{thinkspacesQuery.data.length === 0 ? (
					<Card>
						<CardHeader>
							<CardTitle>No Thinkspaces yet</CardTitle>
							<CardDescription>
								Create the first one around a Goal. It will be stored as active product metadata in
								the D1 index for this account.
							</CardDescription>
						</CardHeader>
						<CardContent className="grid gap-4 sm:grid-cols-3">
							<div className="border border-border p-3">
								<h3 className="font-medium">Goal</h3>
								<p className="mt-1 text-muted-foreground">
									Each Thinkspace starts from one bounded, assessable outcome.
								</p>
							</div>
							<div className="border border-border p-3">
								<h3 className="font-medium">Permissions</h3>
								<p className="mt-1 text-muted-foreground">
									Connected Accounts do not grant access until a Thinkspace receives scoped
									Permissions.
								</p>
							</div>
							<div className="border border-border p-3">
								<h3 className="font-medium">Approvals</h3>
								<p className="mt-1 text-muted-foreground">
									External mutations default to draft or explicit consent before they move on.
								</p>
							</div>
						</CardContent>
					</Card>
				) : (
					<div className="grid gap-3">
						{thinkspacesQuery.data.map((thinkspace) => (
							<Card key={thinkspace.id}>
								<CardHeader>
									<CardTitle>{thinkspace.goal}</CardTitle>
									<CardDescription>{thinkspace.configurationSummary}</CardDescription>
									<CardAction>
										<span className="border border-border px-2 py-1 text-muted-foreground text-xs capitalize">
											{thinkspace.status}
										</span>
									</CardAction>
								</CardHeader>
								<CardContent className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
									<div className="grid gap-1 text-muted-foreground">
										<p>Updated {formatUpdatedAt(thinkspace.updatedAt)}</p>
										{thinkspace.initialInstructions ? (
											<p>Initial instructions: {thinkspace.initialInstructions}</p>
										) : (
											<p>No initial instructions recorded.</p>
										)}
									</div>
									<Button variant="outline" type="button" disabled>
										Detail opens in next slice
									</Button>
								</CardContent>
							</Card>
						))}
					</div>
				)}
			</section>
		</div>
	);
};

export const Route = createFileRoute("/thinkspaces")({
	beforeLoad: async ({ location }) => {
		const session = await getUser();
		if (!session) {
			throw redirect({
				search: { redirect: location.href },
				to: "/login",
			});
		}
		return { session };
	},
	component: RouteComponent,
	loader: async ({ context }) =>
		await context.queryClient.ensureQueryData(context.orpc.thinkspaces.list.queryOptions()),
});
