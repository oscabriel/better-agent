import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useMemo, useState } from "react";
import type { RouterOutputs } from "@/server/lib/router";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/web/components/ui/card";
import { orpc } from "@/web/lib/orpc";
import { ModelBreakdownSection } from "./-components/usage/model-breakdown-section";
import { PeriodSelector } from "./-components/usage/period-selector";
import { StatsGrid } from "./-components/usage/stats-grid";
import { UsageLimitCard } from "./-components/usage/usage-limit-card";

type ModelsList = RouterOutputs["models"]["list"];
type UsageStats = RouterOutputs["usage"]["getStats"];
type ModelUsageEntry = UsageStats["totals"]["models"][string];

export const Route = createFileRoute("/settings/usage")({
	component: UsageSettings,
	loader: async ({ context }) => {
		await Promise.all([
			context.queryClient.ensureQueryData(
				context.orpc.models.list.queryOptions({ staleTime: 60_000 * 5 }),
			),
			context.queryClient.ensureQueryData(
				context.orpc.usage.getCurrentSummary.queryOptions({
					staleTime: 30_000,
				}),
			),
		]);
	},
});

function UsageSettings() {
	const [period, setPeriod] = useState<"day" | "week" | "month">("month");

	const modelsQuery = useQuery(
		orpc.models.list.queryOptions({ staleTime: 60_000 * 5 }),
	);

	const usageQuery = useQuery(
		orpc.usage.getCurrentSummary.queryOptions({ staleTime: 30_000 }),
	);

	const endDate = new Date().toISOString().split("T")[0];
	const startDate = useMemo(() => {
		const date = new Date();
		if (period === "day") {
			return date.toISOString().split("T")[0];
		}
		if (period === "week") {
			date.setDate(date.getDate() - 7);
		} else {
			date.setDate(1); // First day of current month
		}
		return date.toISOString().split("T")[0];
	}, [period]);

	const statsQuery = useQuery(
		orpc.usage.getStats.queryOptions({
			input: {
				startDate,
				endDate,
			},
			staleTime: 30_000,
		}),
	);

	const getModelDisplayName = (modelId: string): string => {
		const model = modelsQuery.data?.find(
			(m: ModelsList[number]) => m.id === modelId,
		);
		return model?.name ?? modelId;
	};

	const isLoading = usageQuery.isLoading || statsQuery.isLoading;

	if (isLoading) {
		return (
			<div className="flex h-full items-center justify-center">
				<Loader2 className="size-8 animate-spin text-muted-foreground" />
			</div>
		);
	}

	const usage = usageQuery.data;
	const stats = statsQuery.data;

	const totalMessages = stats?.totals?.messages ?? 0;
	const totalInputTokens = stats?.totals?.tokens?.input ?? 0;
	const totalOutputTokens = stats?.totals?.tokens?.output ?? 0;
	const totalReasoningTokens = stats?.totals?.tokens?.reasoning ?? 0;
	const totalTokens = stats?.totals?.tokens?.total ?? 0;

	const modelEntries: Array<[string, ModelUsageEntry]> = stats?.totals?.models
		? (
				Object.entries(stats.totals.models) as Array<[string, ModelUsageEntry]>
			).sort(([, a], [, b]) => b.messages - a.messages)
		: [];

	return (
		<div className="space-y-6">
			<UsageLimitCard usage={usage} />

			<Card>
				<CardHeader>
					<div className="flex items-center justify-between">
						<div>
							<CardTitle className="mb-1.5">Usage Statistics</CardTitle>
							<CardDescription>
								Detailed breakdown of your activity.
							</CardDescription>
						</div>
						<PeriodSelector period={period} onPeriodChange={setPeriod} />
					</div>
				</CardHeader>
				<CardContent className="space-y-6">
					<StatsGrid
						totalMessages={totalMessages}
						totalInputTokens={totalInputTokens}
						totalOutputTokens={totalOutputTokens}
						totalReasoningTokens={totalReasoningTokens}
						totalTokens={totalTokens}
					/>

					<ModelBreakdownSection
						modelEntries={modelEntries}
						totalMessages={totalMessages}
						getModelDisplayName={getModelDisplayName}
					/>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Need More?</CardTitle>
					<CardDescription>
						Add your own API keys for unlimited usage with no rate limits
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-4">
					<div className="space-y-3">
						<a
							href="/settings/providers"
							className="flex w-full items-center justify-center rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground text-sm hover:bg-primary/90"
						>
							Configure API Keys
						</a>
					</div>
				</CardContent>
			</Card>
		</div>
	);
}
