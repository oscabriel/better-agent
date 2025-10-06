import type { RouterOutputs } from "@/server/api/orpc";
import { Badge } from "@/web/components/ui/badge";
import { Switch } from "@/web/components/ui/switch";

type ModelDefinition = RouterOutputs["models"]["list"][number];

interface ModelRowProps {
	model: ModelDefinition;
	enabled: boolean;
	onToggle: (enabled: boolean) => void;
	available: boolean;
	isFreeModel: boolean;
	isUpdating: boolean;
	formatCost: (cost: { input: number; output: number }) => string;
	formatContext: (contextWindow: number) => string;
}

export function ModelRow({
	model,
	enabled,
	onToggle,
	available,
	isFreeModel,
	isUpdating,
	formatCost,
	formatContext,
}: ModelRowProps) {
	return (
		<div
			className={`flex flex-col gap-3 border bg-background/60 p-4 transition-all md:flex-row md:items-center md:justify-between ${
				!available ? "opacity-50" : ""
			}`}
		>
			<div className="flex-1 space-y-2">
				<div className="flex items-center gap-2">
					<h3 className="font-semibold">{model.name}</h3>
				</div>

				<p className="text-muted-foreground text-sm">{model.description}</p>

				<div className="flex flex-wrap gap-1">
					{model.capabilities.map((capability) => (
						<Badge key={capability} variant="outline" className="text-xs">
							{capability}
						</Badge>
					))}
				</div>

				<div className="text-muted-foreground text-xs">
					Context: {formatContext(model.contextWindow)}
					{model.maxOutputTokens &&
						` • Output: ${formatContext(model.maxOutputTokens)} •`}
					{model.costPer1MTokens && (
						<span className="ml-2 text-amber-600">
							Cost: {formatCost(model.costPer1MTokens)}
						</span>
					)}
				</div>

				{!available && (
					<p className="font-medium text-destructive text-xs">
						Requires API key to use
					</p>
				)}
			</div>

			{isFreeModel ? (
				<Badge variant="secondary" className="text-xs">
					Built-In
				</Badge>
			) : (
				<div className="flex items-center gap-2">
					<Switch
						checked={enabled}
						onCheckedChange={onToggle}
						disabled={!available || isUpdating}
						aria-label={`Toggle ${model.name}`}
					/>
					<span className="text-muted-foreground text-xs">
						{enabled ? "Shown" : "Hidden"}
					</span>
				</div>
			)}
		</div>
	);
}
