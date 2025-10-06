import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/web/components/ui/tooltip";

function formatTokenCount(count: number): string {
	if (count >= 1_000_000) {
		return `${(count / 1_000_000).toFixed(2)}M`;
	}
	if (count >= 1_000) {
		return `${(count / 1_000).toFixed(2)}K`;
	}
	return count.toLocaleString();
}

interface StatsGridProps {
	totalMessages: number;
	totalInputTokens: number;
	totalOutputTokens: number;
	totalReasoningTokens: number;
	totalTokens: number;
}

export function StatsGrid({
	totalMessages,
	totalInputTokens,
	totalOutputTokens,
	totalReasoningTokens,
	totalTokens,
}: StatsGridProps) {
	return (
		<TooltipProvider>
			<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
				<div className="border bg-background/60 p-4">
					<p className="text-muted-foreground text-xs uppercase tracking-wide">
						Total Messages
					</p>
					<p className="mt-1 font-semibold text-2xl">
						{totalMessages.toLocaleString()}
					</p>
				</div>
				<div className="border bg-background/60 p-4">
					<p className="text-muted-foreground text-xs uppercase tracking-wide">
						Input Tokens
					</p>
					<Tooltip>
						<TooltipTrigger asChild>
							<p className="mt-1 cursor-help font-semibold text-2xl">
								{formatTokenCount(totalInputTokens)}
							</p>
						</TooltipTrigger>
						<TooltipContent>
							<p>{totalInputTokens.toLocaleString()} tokens</p>
						</TooltipContent>
					</Tooltip>
				</div>
				<div className="border bg-background/60 p-4">
					<p className="text-muted-foreground text-xs uppercase tracking-wide">
						Output Tokens
					</p>
					<Tooltip>
						<TooltipTrigger asChild>
							<p className="mt-1 cursor-help font-semibold text-2xl">
								{formatTokenCount(totalOutputTokens)}
							</p>
						</TooltipTrigger>
						<TooltipContent>
							<p>{totalOutputTokens.toLocaleString()} tokens</p>
						</TooltipContent>
					</Tooltip>
				</div>
				<div className="border bg-background/60 p-4">
					<p className="text-muted-foreground text-xs uppercase tracking-wide">
						Reasoning Tokens
					</p>
					<Tooltip>
						<TooltipTrigger asChild>
							<p className="mt-1 cursor-help font-semibold text-2xl">
								{formatTokenCount(totalReasoningTokens)}
							</p>
						</TooltipTrigger>
						<TooltipContent>
							<p>{totalReasoningTokens.toLocaleString()} tokens</p>
						</TooltipContent>
					</Tooltip>
				</div>
				<div className="border bg-background/60 p-4">
					<p className="text-muted-foreground text-xs uppercase tracking-wide">
						Total Tokens
					</p>
					<Tooltip>
						<TooltipTrigger asChild>
							<p className="mt-1 cursor-help font-semibold text-2xl">
								{formatTokenCount(totalTokens)}
							</p>
						</TooltipTrigger>
						<TooltipContent>
							<p>{totalTokens.toLocaleString()} tokens</p>
						</TooltipContent>
					</Tooltip>
				</div>
			</div>
		</TooltipProvider>
	);
}
