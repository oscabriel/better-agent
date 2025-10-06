import { Calendar, TrendingUp } from "lucide-react";
import type { RouterOutputs } from "@/server/api/orpc";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/web/components/ui/card";
import { Progress } from "@/web/components/ui/progress";

type UsageSummary = RouterOutputs["usage"]["getCurrentSummary"];

interface UsageLimitCardProps {
	usage: UsageSummary | undefined;
}

export function UsageLimitCard({ usage }: UsageLimitCardProps) {
	const dailyPercentage = usage
		? (usage.daily.used / usage.daily.limit) * 100
		: 0;
	const monthlyPercentage = usage
		? (usage.monthly.used / usage.monthly.limit) * 100
		: 0;

	return (
		<Card>
			<CardHeader>
				<div className="flex items-center justify-between">
					<div>
						<CardTitle className="mb-1.5">Usage Limits</CardTitle>
						<CardDescription>
							Limits reset at midnight UTC and on the 1st of the month.
						</CardDescription>
					</div>
				</div>
			</CardHeader>
			<CardContent className="space-y-6">
				{/* Daily Usage */}
				<div>
					<div className="mb-2 flex items-center justify-between">
						<div className="flex items-center gap-2">
							<Calendar className="size-4 text-muted-foreground" />
							<span className="font-medium text-sm">Today's Messages</span>
						</div>
						<span className="text-muted-foreground text-sm">
							{usage?.daily.used || 0} / {usage?.daily.limit || 0}
						</span>
					</div>
					<Progress value={dailyPercentage} className="h-2" />
					<p className="mt-1 text-muted-foreground text-xs">
						{usage?.daily.remaining || 0} messages remaining today
					</p>
				</div>

				{/* Monthly Usage */}
				<div>
					<div className="mb-2 flex items-center justify-between">
						<div className="flex items-center gap-2">
							<TrendingUp className="size-4 text-muted-foreground" />
							<span className="font-medium text-sm">This Month's Messages</span>
						</div>
						<span className="text-muted-foreground text-sm">
							{usage?.monthly.used || 0} / {usage?.monthly.limit || 0}
						</span>
					</div>
					<Progress value={monthlyPercentage} className="h-2" />
					<p className="mt-1 text-muted-foreground text-xs">
						{usage?.monthly.remaining || 0} messages remaining this month
					</p>
				</div>

				{/* Daily limit warnings */}
				{dailyPercentage >= 100 ? (
					<div className="border border-red-200 bg-red-50 p-3">
						<p className="font-medium text-red-900 text-sm">
							🚫 Daily limit reached
						</p>
						<p className="mt-1 text-red-800 text-xs">
							You've used all your free messages for today. Add your own API key
							in{" "}
							<a
								href="/settings/providers"
								className="underline hover:text-red-900"
							>
								Provider Settings
							</a>{" "}
							for unlimited usage, or try again tomorrow.
						</p>
					</div>
				) : dailyPercentage >= 80 ? (
					<div className="border border-amber-200 bg-amber-50 p-3">
						<p className="text-amber-800 text-sm">
							⚠️ You're approaching your daily limit. Add your own API key in{" "}
							<a
								href="/settings/providers"
								className="underline hover:text-amber-900"
							>
								Provider Settings
							</a>{" "}
							for unlimited usage.
						</p>
					</div>
				) : null}

				{/* Monthly limit warnings */}
				{monthlyPercentage >= 100 ? (
					<div className="border border-red-200 bg-red-50 p-3">
						<p className="font-medium text-red-900 text-sm">
							🚫 Monthly limit reached
						</p>
						<p className="mt-1 text-red-800 text-xs">
							You've used all your free messages for this month. Add your own
							API key in{" "}
							<a
								href="/settings/providers"
								className="underline hover:text-red-900"
							>
								Provider Settings
							</a>{" "}
							for unlimited usage. Your free quota will reset on the 1st of next
							month.
						</p>
					</div>
				) : monthlyPercentage >= 80 ? (
					<div className="border border-amber-200 bg-amber-50 p-3">
						<p className="text-amber-800 text-sm">
							⚠️ You're approaching your monthly limit. Add your own API key in{" "}
							<a
								href="/settings/providers"
								className="underline hover:text-amber-900"
							>
								Provider Settings
							</a>{" "}
							for unlimited usage.
						</p>
					</div>
				) : null}
			</CardContent>
		</Card>
	);
}
