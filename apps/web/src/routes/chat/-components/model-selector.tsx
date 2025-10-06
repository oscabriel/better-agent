import { useQuery } from "@tanstack/react-query";
import { Brain } from "lucide-react";
import { useMemo } from "react";
import type { RouterOutputs } from "@/server/api/orpc";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/web/components/ui/select";
import { useUserSettings } from "@/web/hooks/use-user-settings";
import { orpc } from "@/web/lib/orpc";

interface ModelSelectorProps {
	modelId?: string;
	onModelChange?: (modelId: string) => void;
}

const DEFAULT_MODEL_ID = "google:gemini-2.5-flash-lite";

type ModelDefinition = RouterOutputs["models"]["list"][number];

export function ModelSelector({ modelId, onModelChange }: ModelSelectorProps) {
	const modelsQuery = useQuery(
		orpc.models.list.queryOptions({
			staleTime: 60_000,
		}),
	);

	const settingsQuery = useUserSettings();

	const models = modelsQuery.data || [];
	const userApiKeys = settingsQuery.data?.apiKeys || {};
	const enabledModels = settingsQuery.data?.enabledModels || [];

	const modelsWithAvailability = models.map((model: ModelDefinition) => {
		const providerKey = model.id.split(":")[0] || model.provider.toLowerCase();
		const hasProviderKey = Boolean(userApiKeys[providerKey]);
		const isAvailable = model.access === "free" || hasProviderKey;
		return {
			...model,
			providerKey,
			isAvailable,
		};
	});

	const isLoading = modelsQuery.isLoading || settingsQuery.isLoading;
	const effectiveValue = modelId ?? DEFAULT_MODEL_ID;
	const selectedModelDef = modelsWithAvailability.find(
		(model: ModelDefinition & { isAvailable: boolean }) =>
			model.id === effectiveValue,
	);

	const hasCustomSelection = enabledModels.length > 0;
	const enabledModelSet = useMemo(
		() => new Set(enabledModels),
		[enabledModels],
	);
	const shouldIncludeModel = (
		model: ModelDefinition & { isAvailable: boolean },
	): boolean => {
		if (model.access === "free") return true;
		if (!hasCustomSelection) return true;
		if (enabledModelSet.has(model.id)) return true;
		return selectedModelDef?.id === model.id;
	};

	const visibleModels = modelsWithAvailability.filter(shouldIncludeModel);
	const freeModels = visibleModels.filter(
		(model: ModelDefinition & { isAvailable: boolean }) =>
			model.access === "free",
	);
	const byokModels = visibleModels.filter(
		(model: ModelDefinition & { isAvailable: boolean }) =>
			model.access === "byok",
	);

	const hasAnyModels = visibleModels.length > 0;

	return (
		<Select
			value={selectedModelDef ? selectedModelDef.id : effectiveValue}
			onValueChange={(value) => onModelChange?.(value)}
			disabled={isLoading || !hasAnyModels}
		>
			<SelectTrigger className="h-9 w-auto">
				<SelectValue
					placeholder={isLoading ? "Loading models..." : "Select a model"}
				>
					{selectedModelDef && <span>{selectedModelDef.name}</span>}
				</SelectValue>
			</SelectTrigger>
			<SelectContent className="max-h-72">
				{isLoading ? (
					<div className="px-2 py-4 text-center text-muted-foreground text-sm">
						Loading models...
					</div>
				) : !hasAnyModels ? (
					<div className="px-2 py-4 text-center text-muted-foreground text-sm">
						No models available. Configure providers in Settings.
					</div>
				) : (
					<>
						{freeModels.length > 0 && (
							<>
								<div className="px-2 py-1.5 font-semibold text-muted-foreground text-xs">
									Basic Models
								</div>
								{freeModels.map(
									(model: ModelDefinition & { isAvailable: boolean }) => {
										const hasReasoning =
											model.capabilities?.includes("reasoning");
										return (
											<SelectItem key={model.id} value={model.id}>
												<div className="flex items-center gap-2">
													<span>{model.name}</span>
													{hasReasoning && (
														<Brain className="size-3 text-purple-600" />
													)}
												</div>
											</SelectItem>
										);
									},
								)}
							</>
						)}

						{byokModels.length > 0 && (
							<>
								<div className="mt-2 border-t px-2 py-1.5 pt-2 font-semibold text-muted-foreground text-xs">
									BYOK Models
								</div>
								{byokModels.map(
									(model: ModelDefinition & { isAvailable: boolean }) => {
										const hasReasoning =
											model.capabilities?.includes("reasoning");
										return (
											<SelectItem
												key={model.id}
												value={model.id}
												disabled={!model.isAvailable}
												title={
													model.isAvailable
														? undefined
														: `Add your ${model.provider} API key in Settings → Providers`
												}
											>
												<div className="flex items-center gap-2">
													<span
														className={!model.isAvailable ? "opacity-50" : ""}
													>
														{model.name}
													</span>
													{hasReasoning && (
														<Brain className="size-3 text-purple-600" />
													)}
												</div>
											</SelectItem>
										);
									},
								)}
							</>
						)}
					</>
				)}
			</SelectContent>
		</Select>
	);
}
