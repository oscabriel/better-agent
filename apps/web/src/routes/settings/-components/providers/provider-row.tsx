import { Key } from "lucide-react";
import { Badge } from "@/web/components/ui/badge";
import { Button } from "@/web/components/ui/button";

interface Provider {
	id: string;
	name: string;
	description: string;
	appProvided: boolean;
}

interface ProviderRowProps {
	provider: Provider;
	hasUserKey: boolean;
	onAddKey: (provider: Provider) => void;
}

export function ProviderRow({
	provider,
	hasUserKey,
	onAddKey,
}: ProviderRowProps) {
	return (
		<div className="flex flex-col gap-3 border bg-background/60 p-4 md:flex-row md:items-center md:justify-between">
			<div className="flex-1 space-y-1">
				<div className="flex items-center gap-2">
					<h3 className="font-medium text-sm">{provider.name}</h3>
					{provider.appProvided ? (
						<Badge
							variant={hasUserKey ? "default" : "secondary"}
							className="text-xs"
						>
							{hasUserKey ? "Custom Key Active" : "Built-In"}
						</Badge>
					) : (
						<Badge
							variant={hasUserKey ? "default" : "secondary"}
							className="text-xs"
						>
							{hasUserKey ? "Connected" : "Not Connected"}
						</Badge>
					)}
				</div>
				<p className="text-muted-foreground text-xs">{provider.description}</p>
				{provider.appProvided ? (
					hasUserKey ? (
						<p className="text-muted-foreground text-xs">
							You're using your own API key for premium models
						</p>
					) : (
						<p className="text-muted-foreground text-xs">
							Using app-provided key for free models only
						</p>
					)
				) : hasUserKey ? (
					<p className="text-muted-foreground text-xs">
						Your API key is configured and active
					</p>
				) : (
					<p className="text-muted-foreground text-xs">
						Add your API key to unlock these models
					</p>
				)}
			</div>
			<Button
				variant={hasUserKey ? "outline" : "default"}
				size="sm"
				onClick={() => onAddKey(provider)}
			>
				<Key className="mr-2 size-4" />
				{hasUserKey ? "Update API Key" : "Add Your API Key"}
			</Button>
		</div>
	);
}
