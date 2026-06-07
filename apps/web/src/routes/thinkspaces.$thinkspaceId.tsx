import { Button } from "@better-agent/ui/components/button";
import {
	Card,
	CardAction,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@better-agent/ui/components/card";
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, getRouteApi, Link, redirect } from "@tanstack/react-router";

import { getUser } from "@/functions/get-user";

const routeApi = getRouteApi("/thinkspaces/$thinkspaceId");

const dateFormatter = new Intl.DateTimeFormat("en", {
	dateStyle: "medium",
	timeStyle: "short",
});

const formatDateTime = (value: Date | number | string | null): string => {
	if (!value) {
		return "Not recorded";
	}

	return dateFormatter.format(new Date(value));
};

const referenceSurfaces = [
	{
		description:
			"Sources will hold external or user-provided material made available to this Thinkspace. Source blobs stay out of the product index.",
		title: "Sources",
	},
	{
		description:
			"Memory will contain retained understanding accepted into this Thinkspace, not a transcript or hidden model state.",
		title: "Memory",
	},
	{
		description:
			"Audit Trail will be the user-facing history of meaningful changes and actions inside this Thinkspace.",
		title: "Audit Trail",
	},
	{
		description:
			"Artifacts will be durable outputs produced by the Thinkspace, such as handoffs, plans, diagrams, exports, or snapshots.",
		title: "Artifacts",
	},
] as const;

interface EnabledToolSelection {
	risk: "read_only" | "mutating" | "unknown";
	serverId: string;
	toolName?: string;
}

interface PermissionPlaceholder {
	actions: string[];
	approvalRequired: boolean;
	resource: {
		serverId: string;
		toolName: string;
	};
	risk: string;
	type: string;
}

const parseJsonArray = <T,>(value: string): T[] => {
	try {
		const parsed = JSON.parse(value) as unknown;
		return Array.isArray(parsed) ? (parsed as T[]) : [];
	} catch {
		return [];
	}
};

const RouteComponent = () => {
	const { thinkspaceId } = routeApi.useParams();
	const context = routeApi.useRouteContext();
	const queryClient = useQueryClient();
	const thinkspaceQuery = useSuspenseQuery(
		context.orpc.thinkspaces.get.queryOptions({ input: { thinkspaceId } }),
	);
	const mcpCatalogQuery = useSuspenseQuery(context.orpc.mcp.listCatalog.queryOptions());
	const archiveMutation = useMutation(
		context.orpc.thinkspaces.archive.mutationOptions({
			onSuccess: async () => {
				await Promise.all([
					queryClient.invalidateQueries({
						queryKey: context.orpc.thinkspaces.get.queryKey({ input: { thinkspaceId } }),
					}),
					queryClient.invalidateQueries({
						queryKey: context.orpc.thinkspaces.list.queryKey(),
					}),
				]);
			},
		}),
	);
	const updateToolSelectionsMutation = useMutation(
		context.orpc.thinkspaces.updateToolSelections.mutationOptions({
			onSuccess: async () => {
				await queryClient.invalidateQueries({
					queryKey: context.orpc.thinkspaces.get.queryKey({ input: { thinkspaceId } }),
				});
			},
		}),
	);

	const thinkspace = thinkspaceQuery.data;
	const isArchived = thinkspace.status === "archived";
	const enabledTools = parseJsonArray<EnabledToolSelection>(thinkspace.enabledToolIds);
	const requestedPermissions = parseJsonArray<PermissionPlaceholder>(
		thinkspace.requestedPermissions,
	);
	const archiveButtonLabel = (() => {
		if (isArchived) {
			return "Thinkspace archived";
		}

		if (archiveMutation.isPending) {
			return "Archiving…";
		}

		return "Archive Thinkspace";
	})();

	const handleArchive = () => {
		if (isArchived || archiveMutation.isPending) {
			return;
		}

		archiveMutation.mutate({ thinkspaceId });
	};

	const toggleCatalogTool = (serverId: string, risk: "read_only" | "mutating" | "unknown") => {
		const selected = enabledTools.some((tool) => tool.serverId === serverId);
		const selections = selected
			? enabledTools.filter((tool) => tool.serverId !== serverId)
			: [...enabledTools, { risk, serverId }];

		updateToolSelectionsMutation.mutate({ selections, thinkspaceId });
	};

	return (
		<div className="mx-auto grid w-full max-w-6xl gap-6 px-4 py-8">
			<nav aria-label="Thinkspace navigation">
				<Button render={<Link to="/thinkspaces" />} variant="ghost">
					← Back to Thinkspaces
				</Button>
			</nav>

			<Card className={isArchived ? "border-muted bg-muted/20" : undefined}>
				<CardHeader>
					<CardTitle>{thinkspace.goal}</CardTitle>
					<CardDescription>{thinkspace.configurationSummary}</CardDescription>
					<CardAction>
						<span className="border border-border px-2 py-1 text-muted-foreground text-xs capitalize">
							{thinkspace.status}
						</span>
					</CardAction>
				</CardHeader>
				<CardContent className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
					<div className="grid gap-3">
						<div>
							<h2 className="font-medium">Initial instructions</h2>
							<p className="mt-1 text-muted-foreground">
								{thinkspace.initialInstructions || "No initial instructions were recorded."}
							</p>
						</div>
						{isArchived ? (
							<output className="block border border-border bg-background p-3">
								<span className="font-medium">Archived and inert</span>
								<span className="mt-1 block text-muted-foreground">
									This Thinkspace remains inspectable, but active Skills, future schedules, tool
									enablement, and Permission-driven work are disabled for this shell.
								</span>
							</output>
						) : null}
					</div>
					<dl className="grid gap-2 text-xs">
						<div className="grid gap-1 border border-border p-2">
							<dt className="text-muted-foreground">Thinkspace ID</dt>
							<dd className="break-all font-mono">{thinkspace.id}</dd>
						</div>
						<div className="grid gap-1 border border-border p-2">
							<dt className="text-muted-foreground">Updated</dt>
							<dd>{formatDateTime(thinkspace.updatedAt)}</dd>
						</div>
						<div className="grid gap-1 border border-border p-2">
							<dt className="text-muted-foreground">Archived</dt>
							<dd>{formatDateTime(thinkspace.archivedAt)}</dd>
						</div>
					</dl>
					{archiveMutation.error ? (
						<p className="text-destructive text-xs lg:col-span-2" role="alert">
							{archiveMutation.error.message}
						</p>
					) : null}
					<div className="lg:col-span-2">
						<Button
							disabled={isArchived || archiveMutation.isPending}
							onClick={handleArchive}
							type="button"
							variant="destructive"
						>
							{archiveButtonLabel}
						</Button>
					</div>
				</CardContent>
			</Card>

			<section className="grid gap-3" aria-labelledby="tools-heading">
				<div className="grid gap-1">
					<p className="text-muted-foreground text-xs uppercase tracking-[0.24em]">
						Thinkspace scoped
					</p>
					<h2 id="tools-heading" className="text-xl font-semibold tracking-tight">
						Skills and tools
					</h2>
					<p className="max-w-3xl text-muted-foreground">
						Product-level MCP catalog entries and Connected Accounts do not grant this Thinkspace
						access. Select catalog tools explicitly for this Goal; this slice records placeholders
						and performs no external execution.
					</p>
				</div>
				<div className="grid gap-3 md:grid-cols-2">
					{mcpCatalogQuery.data.map((server) => {
						const selected = enabledTools.some((tool) => tool.serverId === server.id);
						return (
							<Card
								key={server.id}
								className={selected ? "border-primary/40 bg-primary/5" : undefined}
							>
								<CardHeader>
									<CardTitle>{server.name}</CardTitle>
									<CardDescription>{server.description}</CardDescription>
									<CardAction>
										<span className="border border-border px-2 py-1 text-muted-foreground text-xs">
											{server.riskLevel}
										</span>
									</CardAction>
								</CardHeader>
								<CardContent className="grid gap-3">
									<p className="text-muted-foreground text-xs">
										Default for new Thinkspaces:{" "}
										{server.enabledByDefaultForThinkspaces ? "enabled" : "disabled"}
									</p>
									<Button
										disabled={isArchived || updateToolSelectionsMutation.isPending}
										onClick={() => toggleCatalogTool(server.id, server.riskLevel)}
										type="button"
										variant={selected ? "secondary" : "outline"}
									>
										{selected ? "Remove from this Thinkspace" : "Select for this Goal"}
									</Button>
								</CardContent>
							</Card>
						);
					})}
				</div>
				{updateToolSelectionsMutation.error ? (
					<p className="text-destructive text-xs" role="alert">
						{updateToolSelectionsMutation.error.message}
					</p>
				) : null}
			</section>

			<section className="grid gap-3" aria-labelledby="permissions-heading">
				<div className="grid gap-1">
					<h2 id="permissions-heading" className="text-xl font-semibold tracking-tight">
						Permissions
					</h2>
					<p className="max-w-3xl text-muted-foreground">
						Permissions describe possible access for this Thinkspace. They are not Approvals for any
						proposed action.
					</p>
				</div>
				<Card>
					<CardHeader>
						<CardTitle>
							{requestedPermissions.length === 0
								? "No Permissions requested"
								: "Permission placeholders"}
						</CardTitle>
						<CardDescription>
							{requestedPermissions.length === 0
								? "New Thinkspaces start with no enabled tools and no Permissions."
								: "These placeholders can become narrow, reviewable Permissions in a later runtime slice."}
						</CardDescription>
					</CardHeader>
					{requestedPermissions.length > 0 ? (
						<CardContent className="grid gap-2">
							{requestedPermissions.map((permission) => (
								<div
									key={`${permission.resource.serverId}:${permission.resource.toolName}`}
									className="border border-border p-3 text-sm"
								>
									<p className="font-medium">{permission.resource.serverId}</p>
									<p className="text-muted-foreground text-xs">
										Risk: {permission.risk} · Approval required:{" "}
										{permission.approvalRequired ? "yes" : "no"}
									</p>
								</div>
							))}
						</CardContent>
					) : null}
				</Card>
			</section>

			<section className="grid gap-3" aria-labelledby="approvals-heading">
				<div className="grid gap-1">
					<p className="text-muted-foreground text-xs uppercase tracking-[0.24em]">
						Judgement holdpoints
					</p>
					<h2 id="approvals-heading" className="text-xl font-semibold tracking-tight">
						Approvals
					</h2>
					<p className="max-w-3xl text-muted-foreground">
						Approvals are consent checkpoints for proposed actions inside existing Permissions. When
						a future runtime creates them, each item should be shaped for aggregation into the
						per-user Review Queue instead of staying trapped inside this detail view.
					</p>
				</div>
				<Card className="border-primary/20 bg-primary/5">
					<CardHeader>
						<CardTitle>No Approvals waiting</CardTitle>
						<CardDescription>
							Future Approval items can carry Thinkspace ID, Permission scope, proposed action,
							risk, recommendation, and expiry so the Coordinator can batch them in the Review
							Queue.
						</CardDescription>
					</CardHeader>
				</Card>
			</section>

			<section className="grid gap-3" aria-labelledby="thinkspace-surfaces-heading">
				<div className="grid gap-1">
					<h2 id="thinkspace-surfaces-heading" className="text-xl font-semibold tracking-tight">
						Thinkspace surfaces
					</h2>
					<p className="text-muted-foreground">
						These first-class surfaces make the target architecture visible before runtime-local
						storage, Sources, Memory, and Artifacts are implemented.
					</p>
				</div>
				<div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
					{referenceSurfaces.map((surface) => (
						<Card key={surface.title} className={isArchived ? "opacity-75" : undefined}>
							<CardHeader>
								<CardTitle>{surface.title}</CardTitle>
								<CardDescription>{surface.description}</CardDescription>
							</CardHeader>
							<CardContent>
								<p className="text-muted-foreground text-xs">
									Empty in this slice. No runtime-local records or blobs have been created.
								</p>
							</CardContent>
						</Card>
					))}
				</div>
			</section>
		</div>
	);
};

export const Route = createFileRoute("/thinkspaces/$thinkspaceId")({
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
	loader: async ({ context, params }) =>
		await context.queryClient.ensureQueryData(
			context.orpc.thinkspaces.get.queryOptions({
				input: { thinkspaceId: params.thinkspaceId },
			}),
		),
});
