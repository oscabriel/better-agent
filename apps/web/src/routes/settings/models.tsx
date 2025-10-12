import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import type { RouterOutputs } from "@/server/lib/router";
import { Badge } from "@/web/components/ui/badge";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/web/components/ui/card";
import {
	useUpdateUserSettings,
	useUserSettings,
} from "@/web/hooks/use-user-settings";
import { orpc } from "@/web/lib/orpc";
import { ModelRow } from "./-components/models/model-row";

type ModelDefinition = RouterOutputs["models"]["list"][number];

export const Route = createFileRoute("/settings/models")({
	component: ModelSettings,
});

function ModelSettings() {
	const modelsQuery = useQuery(
		orpc.models.list.queryOptions({
			staleTime: 60_000,
		}),
	);

	const settingsQuery = useUserSettings();
	const updateUserSettings = useUpdateUserSettings();
	const [pendingModelId, setPendingModelId] = useState<string | null>(null);

	const handleToggleModel = async (modelId: string, enabled: boolean) => {
		const currentEnabled = settingsQuery.data?.enabledModels || [];
		const newEnabled = enabled
			? [...currentEnabled, modelId]
			: currentEnabled.filter((id: string) => id !== modelId);
		try {
			setPendingModelId(modelId);
			await updateUserSettings({ enabledModels: newEnabled });
			toast.success("Model settings updated");
		} catch (error) {
			const message =
				error instanceof Error ? error.message : "Failed to update models";
			toast.error(message);
		} finally {
			setPendingModelId(null);
		}
	};

	const isLoading = modelsQuery.isLoading || settingsQuery.isLoading;
	const models = modelsQuery.data || [];
	const userApiKeys = settingsQuery.data?.apiKeys || {};
	const enabledModels = settingsQuery.data?.enabledModels || [];

	const freeModels = models.filter((m: ModelDefinition) => m.access === "free");
	const premiumModels = models.filter(
		(m: ModelDefinition) => m.access === "byok",
	);

	const premiumByProvider = premiumModels.reduce(
		(acc: Record<string, ModelDefinition[]>, model: ModelDefinition) => {
			if (!acc[model.provider]) acc[model.provider] = [];
			acc[model.provider].push(model);
			return acc;
		},
		{} as Record<string, ModelDefinition[]>,
	);

	const formatCost = (cost: { input: number; output: number }) => {
		return `$${cost.input.toFixed(2)}/$${cost.output.toFixed(2)}`;
	};

	const formatContext = (contextWindow: number) => {
		if (contextWindow >= 1_000_000) {
			return `${(contextWindow / 1_000_000).toFixed(1)}M`;
		}
		return `${(contextWindow / 1000).toFixed(0)}K`;
	};

	if (isLoading) {
		return (
			<div className="flex h-full items-center justify-center">
				<Loader2 className="size-8 animate-spin text-muted-foreground" />
			</div>
		);
	}

	return (
		<div className="space-y-6">
			{/* Free Models */}
			<Card>
				<CardHeader>
					<div className="flex items-center gap-2">
						<CardTitle>Basic Models</CardTitle>
					</div>
					<CardDescription>
						These models are provided free of charge (with limited usage).
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-3">
					{freeModels.length === 0 ? (
						<p className="text-muted-foreground text-sm">
							No free models available
						</p>
					) : (
						freeModels.map((model: ModelDefinition) => (
							<ModelRow
								key={model.id}
								model={model}
								enabled={enabledModels.includes(model.id)}
								onToggle={(enabled) => handleToggleModel(model.id, enabled)}
								available={true}
								isFreeModel={true}
								isUpdating={pendingModelId === model.id}
								formatCost={() => "Free"}
								formatContext={formatContext}
							/>
						))
					)}
				</CardContent>
			</Card>

			{/* Premium Models by Provider */}
			{Object.entries(premiumByProvider).map(
				([provider, providerModels]: [string, ModelDefinition[]]) => {
					const providerId = providerModels[0].id.split(":")[0];
					const hasApiKey = Boolean(userApiKeys[providerId]);

					return (
						<Card key={provider}>
							<CardHeader>
								<div className="flex items-center gap-2">
									<CardTitle>{provider} Models</CardTitle>
									{!hasApiKey ? (
										<Badge variant="destructive" className="text-xs">
											API Key Required
										</Badge>
									) : (
										<Badge variant="secondary" className="text-xs">
											API Key Connected
										</Badge>
									)}
								</div>
								<CardDescription>
									{hasApiKey
										? "These models are unlocked."
										: "Add your API key in Providers settings to unlock."}
								</CardDescription>
							</CardHeader>
							<CardContent className="space-y-3">
								{providerModels.map((model: ModelDefinition) => (
									<ModelRow
										key={model.id}
										model={model}
										enabled={enabledModels.includes(model.id)}
										onToggle={(enabled) => handleToggleModel(model.id, enabled)}
										available={hasApiKey}
										isFreeModel={false}
										isUpdating={pendingModelId === model.id}
										formatCost={formatCost}
										formatContext={formatContext}
									/>
								))}
							</CardContent>
						</Card>
					);
				},
			)}
		</div>
	);
}
