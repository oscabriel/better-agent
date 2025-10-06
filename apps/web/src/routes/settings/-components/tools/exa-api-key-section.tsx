import { Key } from "lucide-react";
import { Badge } from "@/web/components/ui/badge";
import { Button } from "@/web/components/ui/button";

interface ExaApiKeySectionProps {
	hasApiKey: boolean;
	onConfigureKey: () => void;
}

export function ExaApiKeySection({
	hasApiKey,
	onConfigureKey,
}: ExaApiKeySectionProps) {
	return (
		<div className="flex flex-col gap-3 border bg-background/60 p-4 md:flex-row md:items-center md:justify-between">
			<div className="flex-1 space-y-1">
				<div className="flex items-center gap-2">
					<h3 className="font-medium text-sm">Exa</h3>
					<Badge
						variant={hasApiKey ? "default" : "secondary"}
						className="text-xs"
					>
						{hasApiKey ? "Connected" : "Not Connected"}
					</Badge>
				</div>
				<p className="text-muted-foreground text-xs">
					Real-time web search and content retrieval
				</p>
				{hasApiKey ? (
					<p className="text-muted-foreground text-xs">
						Your API key is configured and active
					</p>
				) : (
					<p className="text-muted-foreground text-xs">
						Add your API key to enable web search
					</p>
				)}
			</div>
			<Button
				variant={hasApiKey ? "outline" : "default"}
				size="sm"
				onClick={onConfigureKey}
			>
				<Key className="mr-2 size-4" />
				{hasApiKey ? "Update API Key" : "Add Your API Key"}
			</Button>
		</div>
	);
}
