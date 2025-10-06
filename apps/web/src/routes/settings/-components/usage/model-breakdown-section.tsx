import type { RouterOutputs } from "@/server/api/orpc";
import { Progress } from "@/web/components/ui/progress";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/web/components/ui/tooltip";

type UsageStats = RouterOutputs["usage"]["getStats"];
type ModelUsageEntry = UsageStats["totals"]["models"][string];

function formatTokenCount(count: number): string {
	if (count >= 1_000_000) {
		return `${(count / 1_000_000).toFixed(2)}M`;
	}
	if (count >= 1_000) {
		return `${(count / 1_000).toFixed(2)}K`;
	}
	return count.toLocaleString();
}

interface ModelBreakdownSectionProps {
	modelEntries: Array<[string, ModelUsageEntry]>;
	totalMessages: number;
	getModelDisplayName: (modelId: string) => string;
}

export function ModelBreakdownSection({
	modelEntries,
	totalMessages,
	getModelDisplayName,
}: ModelBreakdownSectionProps) {
	if (modelEntries.length === 0) {
		return null;
	}

	return (
		<div>
			<h3 className="mb-3 font-medium text-sm">Model Breakdown</h3>
			<div className="space-y-3">
				{modelEntries.map(([modelId, entry]) => {
					const percentage = totalMessages
						? (entry.messages / totalMessages) * 100
						: 0;
					return (
						<div key={modelId} className="border bg-background/60 p-4">
							<div className="flex items-center justify-between text-sm">
								<span className="font-medium">
									{getModelDisplayName(modelId)}
								</span>
								<span className="text-muted-foreground">
									{entry.messages.toLocaleString()} messages
								</span>
							</div>
							<Progress value={percentage} className="mt-2 h-1" />
							<div className="mt-3 grid gap-2 sm:grid-cols-4">
								<div>
									<p className="text-muted-foreground text-xs uppercase tracking-wide">
										Input Tokens
									</p>
									<TooltipProvider>
										<Tooltip>
											<TooltipTrigger asChild>
												<p className="cursor-help font-medium text-sm">
													{formatTokenCount(entry.inputTokens)}
												</p>
											</TooltipTrigger>
											<TooltipContent>
												<p>{entry.inputTokens.toLocaleString()} tokens</p>
											</TooltipContent>
										</Tooltip>
									</TooltipProvider>
								</div>
								<div>
									<p className="text-muted-foreground text-xs uppercase tracking-wide">
										Output Tokens
									</p>
									<TooltipProvider>
										<Tooltip>
											<TooltipTrigger asChild>
												<p className="cursor-help font-medium text-sm">
													{formatTokenCount(entry.outputTokens)}
												</p>
											</TooltipTrigger>
											<TooltipContent>
												<p>{entry.outputTokens.toLocaleString()} tokens</p>
											</TooltipContent>
										</Tooltip>
									</TooltipProvider>
								</div>
								<div>
									<p className="text-muted-foreground text-xs uppercase tracking-wide">
										Reasoning Tokens
									</p>
									<TooltipProvider>
										<Tooltip>
											<TooltipTrigger asChild>
												<p className="cursor-help font-medium text-sm">
													{formatTokenCount(entry.reasoningTokens)}
												</p>
											</TooltipTrigger>
											<TooltipContent>
												<p>{entry.reasoningTokens.toLocaleString()} tokens</p>
											</TooltipContent>
										</Tooltip>
									</TooltipProvider>
								</div>
								<div>
									<p className="text-muted-foreground text-xs uppercase tracking-wide">
										Total Tokens
									</p>
									<TooltipProvider>
										<Tooltip>
											<TooltipTrigger asChild>
												<p className="cursor-help font-medium text-sm">
													{formatTokenCount(
														entry.inputTokens +
															entry.outputTokens +
															entry.reasoningTokens,
													)}
												</p>
											</TooltipTrigger>
											<TooltipContent>
												<p>
													{(
														entry.inputTokens +
														entry.outputTokens +
														entry.reasoningTokens
													).toLocaleString()}{" "}
													tokens
												</p>
											</TooltipContent>
										</Tooltip>
									</TooltipProvider>
								</div>
							</div>
						</div>
					);
				})}
			</div>
		</div>
	);
}
