import { cn } from "@better-agent/ui/lib/utils";

const Skeleton = ({ className, ...props }: React.ComponentProps<"div">) => (
	<div
		data-slot="skeleton"
		className={cn("animate-pulse rounded-md bg-muted", className)}
		{...props}
	/>
);

export { Skeleton };
