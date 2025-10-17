import { Trash2 } from "lucide-react";
import type { RouterOutputs } from "@/server/lib/router";
import { Badge } from "@/web/components/ui/badge";
import { Button } from "@/web/components/ui/button";
import { Switch } from "@/web/components/ui/switch";

type MCPServer = RouterOutputs["mcp"]["listServers"][number] & {
	enabled: boolean;
};

interface McpServerRowProps {
	server: MCPServer;
	onToggle: (serverId: string, enabled: boolean) => void;
	onRemove: (serverId: string) => void;
	isToggling: boolean;
	isRemoving: boolean;
}

export function McpServerRow({
	server,
	onToggle,
	onRemove,
	isToggling,
	isRemoving,
}: McpServerRowProps) {
	return (
		<div className="flex flex-col gap-3 border bg-background/60 p-4 md:flex-row md:items-center md:justify-between">
			<div className="flex-1 space-y-2">
				<div className="flex items-center gap-2">
					<h3 className="font-medium">{server.name}</h3>
					{server.isBuiltIn ? (
						<Badge variant="secondary" className="text-xs">
							Built-In
						</Badge>
					) : (
						<Badge variant="outline" className="text-xs">
							Custom
						</Badge>
					)}
					<Badge variant="outline" className="text-xs uppercase">
						{server.type}
					</Badge>
					{server.enabled && (
						<Badge variant="default" className="text-xs">
							Enabled
						</Badge>
					)}
				</div>

				<p className="text-muted-foreground text-sm">{server.description}</p>

				<div className="flex items-center gap-2 text-muted-foreground text-xs">
					<span>{server.url}</span>
				</div>
			</div>

			<div className="flex items-center gap-2">
				{!server.isBuiltIn && (
					<Button
						variant="ghost"
						size="sm"
						onClick={() => onRemove(server.id)}
						className="text-destructive hover:text-destructive"
						disabled={isRemoving}
					>
						<Trash2 className="size-4" />
					</Button>
				)}
				<Switch
					checked={server.enabled}
					onCheckedChange={(enabled: boolean) => onToggle(server.id, enabled)}
					disabled={isToggling}
				/>
			</div>
		</div>
	);
}
