import { Badge } from "@better-agent/ui/components/badge";
import { Button } from "@better-agent/ui/components/button";
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, getRouteApi, Link } from "@tanstack/react-router";
import { CheckIcon, InboxIcon, XIcon } from "lucide-react";

const routeApi = getRouteApi("/review-queue/");

const dateFormatter = new Intl.DateTimeFormat("en", {
	dateStyle: "medium",
	timeStyle: "short",
});

const formatProposedAt = (value: Date | number | string): string =>
	dateFormatter.format(new Date(value));

const ACTION_LABELS: Record<string, string> = {
	memory_write: "Memory proposal",
};

const actionLabel = (actionKind: string): string => ACTION_LABELS[actionKind] ?? "Held action";

const RouteComponent = () => {
	const context = routeApi.useRouteContext();
	const queryClient = useQueryClient();
	const queueQuery = useSuspenseQuery(context.orpc.approvals.list.queryOptions());
	const decideMutation = useMutation(
		context.orpc.approvals.decide.mutationOptions({
			// A decision either resolves the Approval or reveals it already left the
			// queue (decided elsewhere, or the parked turn was evicted); either way the
			// authoritative list is the runtime-backed index, so refetch it both ways.
			onSettled: async () => {
				await queryClient.invalidateQueries({
					queryKey: context.orpc.approvals.list.queryKey(),
				});
			},
		}),
	);

	const decide = (item: (typeof queueQuery.data)[number], decision: "approved" | "rejected") => {
		decideMutation.mutate({
			approvalId: item.approvalId,
			decision,
			thinkspaceId: item.thinkspaceId,
		});
	};

	const pendingApprovals = queueQuery.data;
	const hasPending = pendingApprovals.length > 0;

	return (
		<div className="mx-auto grid w-full max-w-3xl gap-8 px-4 py-8">
			<div className="grid gap-2">
				<h1 className="text-2xl font-semibold tracking-tight">Review Queue</h1>
				<p className="max-w-lg text-muted-foreground text-sm leading-relaxed">
					Actions your Thinkspace Agents have proposed and are holding for your decision. Approve to
					let the action run; reject to discard it. Deep work still happens inside each Sitting.
				</p>
			</div>

			{decideMutation.isError ? (
				<p className="text-destructive text-sm" role="alert">
					{decideMutation.error.message}
				</p>
			) : null}

			<section aria-labelledby="review-queue-heading">
				<h2 className="sr-only" id="review-queue-heading">
					Pending Approvals
				</h2>

				{hasPending ? (
					<ul className="grid gap-3">
						{pendingApprovals.map((item) => {
							const isDeciding =
								decideMutation.isPending &&
								decideMutation.variables?.approvalId === item.approvalId;

							return (
								<li
									className="grid gap-3 rounded-lg border border-border bg-card p-4"
									key={item.approvalId}
								>
									<div className="flex items-start justify-between gap-3">
										<Link
											className="font-medium text-sm hover:underline"
											params={{ thinkspaceId: item.thinkspaceId }}
											to="/thinkspaces/$thinkspaceId"
										>
											{item.thinkspaceGoal}
										</Link>
										<Badge variant="secondary">{actionLabel(item.actionKind)}</Badge>
									</div>

									<p className="text-foreground text-sm leading-relaxed">{item.proposedSummary}</p>

									<div className="flex items-center justify-between gap-3">
										<p className="text-muted-foreground text-xs">
											Proposed {formatProposedAt(item.proposedAt)}
										</p>
										<div className="flex gap-2">
											<Button
												disabled={isDeciding}
												onClick={() => decide(item, "rejected")}
												size="sm"
												variant="outline"
											>
												<XIcon />
												Reject
											</Button>
											<Button
												disabled={isDeciding}
												onClick={() => decide(item, "approved")}
												size="sm"
											>
												<CheckIcon />
												Approve
											</Button>
										</div>
									</div>
								</li>
							);
						})}
					</ul>
				) : (
					<div className="grid justify-items-center gap-2 rounded-lg border border-border border-dashed p-10 text-center">
						<InboxIcon className="size-6 text-muted-foreground" />
						<p className="font-medium text-sm">Your Review Queue is clear</p>
						<p className="max-w-sm text-muted-foreground text-sm">
							When a Thinkspace Agent proposes an action that needs your consent, it will wait for
							you here.
						</p>
					</div>
				)}
			</section>
		</div>
	);
};

export const Route = createFileRoute("/review-queue/")({
	component: RouteComponent,
	loader: async ({ context }) =>
		await context.queryClient.ensureQueryData(context.orpc.approvals.list.queryOptions()),
});
