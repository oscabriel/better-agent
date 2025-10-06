interface PeriodSelectorProps {
	period: "day" | "week" | "month";
	onPeriodChange: (period: "day" | "week" | "month") => void;
}

export function PeriodSelector({
	period,
	onPeriodChange,
}: PeriodSelectorProps) {
	return (
		<div className="flex gap-2">
			<button
				type="button"
				onClick={() => onPeriodChange("day")}
				className={`rounded-md px-3 py-1 text-sm ${
					period === "day" ? "bg-primary text-primary-foreground" : "bg-muted"
				}`}
			>
				Day
			</button>
			<button
				type="button"
				onClick={() => onPeriodChange("week")}
				className={`rounded-md px-3 py-1 text-sm ${
					period === "week" ? "bg-primary text-primary-foreground" : "bg-muted"
				}`}
			>
				Week
			</button>
			<button
				type="button"
				onClick={() => onPeriodChange("month")}
				className={`rounded-md px-3 py-1 text-sm ${
					period === "month" ? "bg-primary text-primary-foreground" : "bg-muted"
				}`}
			>
				Month
			</button>
		</div>
	);
}
