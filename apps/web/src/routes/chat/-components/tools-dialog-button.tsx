import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Hammer, Settings2, ShieldCheck, Wrench } from "lucide-react";
import { useMemo, useState } from "react";
import { Badge } from "@/web/components/ui/badge";
import { Button } from "@/web/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/web/components/ui/dialog";
import { ScrollArea } from "@/web/components/ui/scroll-area";
import { Switch } from "@/web/components/ui/switch";
import { type McpServer, useMcpServers } from "@/web/hooks/use-mcp-servers";
import { orpc } from "@/web/lib/orpc";

export function ToolsDialogButton({ disabled }: { disabled?: boolean }) {
	const [open, setOpen] = useState(false);
	const queryClient = useQueryClient();
	const { data: servers = [], isLoading } = useMcpServers({
		enabled: open,
	});

	const toggleMutation = useMutation(
		orpc.mcp.toggleServer.mutationOptions({
			onSuccess: () => {
				void queryClient.invalidateQueries({
					queryKey: orpc.mcp.listServers.key(),
				});
			},
		}),
	);

	const sortedServers = useMemo(() => {
		return [...(servers as Array<McpServer & { enabled: boolean }>)].sort(
			(a, b) => {
				if (a.isBuiltIn === b.isBuiltIn) {
					return a.name.localeCompare(b.name);
				}
				return a.isBuiltIn ? -1 : 1;
			},
		);
	}, [servers]);

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<Button
					variant="outline"
					size="icon"
					disabled={disabled}
					title="View and toggle tools"
				>
					<Settings2 className="size-4" />
				</Button>
			</DialogTrigger>
			<DialogContent className="max-w-lg">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<Hammer className="size-4 text-green-500" />
						Tools
					</DialogTitle>
					<DialogDescription>
						Toggle tools to make them available to the assistant.
					</DialogDescription>
				</DialogHeader>
				<ScrollArea className="max-h-80 space-y-3 pr-2">
					{isLoading ? (
						<div className="flex items-center justify-center py-8 text-muted-foreground text-sm">
							Loading tools...
						</div>
					) : sortedServers.length === 0 ? (
						<div className="flex flex-col items-center gap-2 py-8 text-center text-muted-foreground text-sm">
							<Wrench className="size-5" />
							<span>No tools configured yet.</span>
						</div>
					) : (
						<div className="space-y-3">
							{sortedServers.map((server) => {
								const isMutating = toggleMutation.isPending;
								return (
									<div
										key={server.id}
										className="flex items-start justify-between rounded-md border p-3"
									>
										<div className="space-y-1.5">
											<div className="flex flex-wrap items-center gap-2">
												<span className="font-medium text-sm">
													{server.name}
												</span>
												{server.isBuiltIn ? (
													<Badge variant="secondary" className="text-xs">
														Built-In
													</Badge>
												) : (
													<Badge variant="outline" className="text-xs">
														Custom
													</Badge>
												)}
												<Badge variant="outline" className="text-xs">
													{server.type.toUpperCase()}
												</Badge>
											</div>
											{server.description ? (
												<p className="text-muted-foreground text-xs">
													{server.description}
												</p>
											) : null}
											<p className="text-xs text-muted-foreground">
												{(() => {
													try {
														const parsed = new URL(server.url);
														return parsed.host + parsed.pathname;
													} catch (_error) {
														return server.url;
													}
												})()}
											</p>
										</div>
										<Switch
											checked={server.enabled}
											onCheckedChange={(checked) =>
												toggleMutation.mutate({
													serverId: server.id,
													enabled: checked,
												})
											}
											disabled={isMutating}
											className="ml-4"
										/>
									</div>
								);
							})}
						</div>
					)}
				</ScrollArea>
				<div className="flex items-center justify-between rounded-md bg-muted/60 px-3 py-2 text-muted-foreground text-xs">
					<div className="items-centered flex gap-2">
						<ShieldCheck className="size-3.5" />
						<span>
							Consider only enabling MCP servers relevant to your immediate use
							case to avoid context bloat.
						</span>
					</div>
				</div>
			</DialogContent>
		</Dialog>
	);
}
