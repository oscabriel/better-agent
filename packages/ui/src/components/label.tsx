import { cn } from "@better-agent/ui/lib/utils";
import * as React from "react";

type LabelProps = React.ComponentProps<"label"> & {
	htmlFor: string;
};

const Label = ({ className, htmlFor, ...props }: LabelProps) => (
	<label
		htmlFor={htmlFor}
		data-slot="label"
		className={cn(
			"flex items-center gap-2 text-xs leading-none select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50",
			className,
		)}
		{...props}
	/>
);

export { Label };
