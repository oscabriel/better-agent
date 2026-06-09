import { Badge } from "@better-agent/ui/components/badge";
import { Button } from "@better-agent/ui/components/button";
import { Separator } from "@better-agent/ui/components/separator";
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
		return "—";
	}

	return dateFormatter.format(new Date(value));
};

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
	const runtimeReadinessQuery = useSuspenseQuery(
		context.orpc.thinkspaces.runtimeReadiness.queryOptions({ input: { thinkspaceId } }),
	);
	const modelReadinessQuery = useSuspenseQuery(
		context.orpc.thinkspaces.modelReadiness.queryOptions({ input: { thinkspaceId } }),
	);
	const runtimePolicyQuery = useSuspenseQuery(
		context.orpc.thinkspaces.runtimePolicy.queryOptions({ input: { thinkspaceId } }),
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
	const runtimeReadiness = runtimeReadinessQuery.data;
	const modelReadiness = modelReadinessQuery.data;
	const runtimePolicy = runtimePolicyQuery.data;
	const isArchived = thinkspace.status === "archived";
	const enabledTools = parseJsonArray<EnabledToolSelection>(thinkspace.enabledToolIds);
	const requestedPermissions = parseJsonArray<PermissionPlaceholder>(
		thinkspace.requestedPermissions,
	);

	const toggleCatalogTool = (serverId: string, risk: "read_only" | "mutating" | "unknown") => {
		const selected = enabledTools.some((tool) => tool.serverId === serverId);
		const selections = selected
			? enabledTools.filter((tool) => tool.serverId !== serverId)
			: [...enabledTools, { risk, serverId }];

		updateToolSelectionsMutation.mutate({ selections, thinkspaceId });
	};

	const handleArchive = () => {
		if (isArchived || archiveMutation.isPending) {
			return;
		}

		archiveMutation.mutate({ thinkspaceId });
	};

	return (
		<div className="mx-auto grid w-full max-w-3xl gap-8 px-4 py-8">
			<Link
				className="w-fit text-muted-foreground text-sm transition-colors hover:text-foreground"
				to="/thinkspaces"
			>
				← Thinkspaces
			</Link>

			<div className="grid gap-4">
				<div className="flex items-start justify-between gap-4">
					<h1 className="text-2xl font-semibold tracking-tight text-balance">{thinkspace.goal}</h1>
					<Badge className="shrink-0" variant={isArchived ? "outline" : "default"}>
						{thinkspace.status}
					</Badge>
				</div>
				<p className="max-w-2xl text-muted-foreground text-sm leading-relaxed">
					{thinkspace.configurationSummary}
				</p>
				{thinkspace.initialInstructions ? (
					<div className="border border-border p-4">
						<p className="mb-1 text-muted-foreground text-xs font-medium">Initial instructions</p>
						<p className="text-sm leading-relaxed">{thinkspace.initialInstructions}</p>
					</div>
				) : null}
				<div className="flex gap-4 text-muted-foreground text-xs">
					<span>Updated {formatDateTime(thinkspace.updatedAt)}</span>
					{thinkspace.archivedAt ? (
						<span>Archived {formatDateTime(thinkspace.archivedAt)}</span>
					) : null}
				</div>
			</div>

			<Separator />

			<section aria-labelledby="runtime-heading" className="grid gap-4">
				<div className="grid gap-1">
					<h2 className="text-lg font-semibold tracking-tight" id="runtime-heading">
						Thinkspace Agent runtime
					</h2>
					<p className="text-muted-foreground text-sm">
						This Thinkspace resolves to one durable Thinkspace Agent using the Thinkspace id as its
						runtime identity.
					</p>
				</div>
				<div className="grid gap-4 border border-border p-4">
					<div className="grid gap-2">
						<div className="flex items-center justify-between gap-4">
							<p className="text-sm font-medium">Runtime readiness</p>
							<Badge variant="outline">{runtimeReadiness.status}</Badge>
						</div>
						<p className="text-muted-foreground text-xs">
							Binding: {runtimeReadiness.bindingName} · Class: {runtimeReadiness.className}
						</p>
						<p className="break-all text-muted-foreground text-xs">
							Runtime identity: {runtimeReadiness.runtimeName}
						</p>
					</div>
					<div className="grid gap-2 border-border border-t pt-4">
						<div className="flex items-center justify-between gap-4">
							<p className="text-sm font-medium">Model readiness</p>
							<Badge variant={modelReadiness.status === "ready" ? "default" : "destructive"}>
								{modelReadiness.status === "ready" ? "ready" : "not ready"}
							</Badge>
						</div>
						<p className="text-muted-foreground text-sm">{modelReadiness.message}</p>
						<p className="text-muted-foreground text-xs">
							{modelReadiness.modelName ?? modelReadiness.modelId} ·{" "}
							{modelReadiness.providerName ?? "Unknown provider"}
						</p>
					</div>
					<div className="grid gap-2 border-border border-t pt-4">
						<div className="flex items-center justify-between gap-4">
							<p className="text-sm font-medium">Runtime safety policy</p>
							<Badge variant="outline">
								{runtimePolicy.mode === "model_only" ? "model-only" : runtimePolicy.mode}
							</Badge>
						</div>
						<p className="text-muted-foreground text-sm">{runtimePolicy.message}</p>
						<ul className="grid gap-1">
							{runtimePolicy.capabilities.map((capability) => (
								<li
									className="flex items-center justify-between gap-4 text-muted-foreground text-xs"
									key={capability.id}
								>
									<span>{capability.label}</span>
									<span>{capability.enabled ? "enabled" : "disabled"}</span>
								</li>
							))}
						</ul>
					</div>
				</div>
			</section>

			<Separator />

			<section aria-labelledby="tools-heading" className="grid gap-4">
				<div className="grid gap-1">
					<h2 className="text-lg font-semibold tracking-tight" id="tools-heading">
						Tools
					</h2>
					<p className="text-muted-foreground text-sm">
						Select catalog tools for this Thinkspace. A Permission is required before execution.
					</p>
				</div>
				{mcpCatalogQuery.data.length === 0 ? (
					<p className="border border-border p-4 text-muted-foreground text-sm">
						No tools in the catalog.
					</p>
				) : (
					<div className="border border-border">
						{mcpCatalogQuery.data.map((server, index) => {
							const selected = enabledTools.some((tool) => tool.serverId === server.id);
							return (
								<div
									key={server.id}
									className={`flex items-center justify-between gap-4 p-4 ${index < mcpCatalogQuery.data.length - 1 ? "border-b border-border" : ""} ${selected ? "bg-muted/30" : ""}`}
								>
									<div className="grid gap-0.5">
										<div className="flex items-center gap-2">
											<p className="text-sm font-medium">{server.name}</p>
											<span className="text-muted-foreground text-xs">{server.riskLevel}</span>
										</div>
										<p className="text-muted-foreground text-sm">{server.description}</p>
									</div>
									<Button
										disabled={isArchived || updateToolSelectionsMutation.isPending}
										onClick={() => toggleCatalogTool(server.id, server.riskLevel)}
										size="sm"
										type="button"
										variant={selected ? "secondary" : "outline"}
									>
										{selected ? "Remove" : "Select"}
									</Button>
								</div>
							);
						})}
					</div>
				)}
				{updateToolSelectionsMutation.error ? (
					<p className="text-destructive text-sm" role="alert">
						{updateToolSelectionsMutation.error.message}
					</p>
				) : null}
			</section>

			<Separator />

			<section aria-labelledby="permissions-heading" className="grid gap-4">
				<div className="grid gap-1">
					<h2 className="text-lg font-semibold tracking-tight" id="permissions-heading">
						Permissions
					</h2>
					<p className="text-muted-foreground text-sm">
						Scoped access for this Thinkspace. Permissions are separate from Approvals.
					</p>
				</div>
				{requestedPermissions.length === 0 ? (
					<p className="border border-border p-4 text-muted-foreground text-sm">
						No Permissions configured.
					</p>
				) : (
					<div className="border border-border">
						{requestedPermissions.map((permission, index) => (
							<div
								key={`${permission.resource.serverId}:${permission.resource.toolName}`}
								className={`grid gap-0.5 p-4 ${index < requestedPermissions.length - 1 ? "border-b border-border" : ""}`}
							>
								<p className="text-sm font-medium">{permission.resource.serverId}</p>
								<p className="text-muted-foreground text-xs">
									Risk: {permission.risk} · Approval required:{" "}
									{permission.approvalRequired ? "yes" : "no"}
								</p>
							</div>
						))}
					</div>
				)}
			</section>

			{isArchived ? null : (
				<>
					<Separator />
					<section className="grid gap-4">
						<div className="grid gap-1">
							<h2 className="text-lg font-semibold tracking-tight">Archive</h2>
							<p className="text-muted-foreground text-sm">
								Archiving disables active work and scheduled tasks. The Thinkspace remains
								inspectable.
							</p>
						</div>
						{archiveMutation.error ? (
							<p className="text-destructive text-sm" role="alert">
								{archiveMutation.error.message}
							</p>
						) : null}
						<div>
							<Button
								disabled={archiveMutation.isPending}
								onClick={handleArchive}
								type="button"
								variant="destructive"
							>
								{archiveMutation.isPending ? "Archiving…" : "Archive Thinkspace"}
							</Button>
						</div>
					</section>
				</>
			)}
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
	loader: async ({ context, params }) => {
		await Promise.all([
			context.queryClient.ensureQueryData(
				context.orpc.thinkspaces.get.queryOptions({
					input: { thinkspaceId: params.thinkspaceId },
				}),
			),
			context.queryClient.ensureQueryData(
				context.orpc.thinkspaces.runtimeReadiness.queryOptions({
					input: { thinkspaceId: params.thinkspaceId },
				}),
			),
			context.queryClient.ensureQueryData(
				context.orpc.thinkspaces.modelReadiness.queryOptions({
					input: { thinkspaceId: params.thinkspaceId },
				}),
			),
			context.queryClient.ensureQueryData(
				context.orpc.thinkspaces.runtimePolicy.queryOptions({
					input: { thinkspaceId: params.thinkspaceId },
				}),
			),
		]);
	},
});
