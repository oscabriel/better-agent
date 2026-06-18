"use client";

import { Tabs as TabsPrimitive } from "@base-ui/react/tabs";
import { cn } from "@better-agent/ui/lib/utils";

const Tabs = ({ className, ...props }: TabsPrimitive.Root.Props) => (
	<TabsPrimitive.Root
		data-slot="tabs"
		className={cn("flex flex-col gap-6", className)}
		{...props}
	/>
);

const TabsList = ({ className, ...props }: TabsPrimitive.List.Props) => (
	<TabsPrimitive.List
		data-slot="tabs-list"
		className={cn(
			"relative flex w-full items-center gap-1 overflow-x-auto border-b border-border",
			className,
		)}
		{...props}
	/>
);

const TabsTab = ({ className, ...props }: TabsPrimitive.Tab.Props) => (
	<TabsPrimitive.Tab
		data-slot="tabs-tab"
		className={cn(
			"relative inline-flex h-9 shrink-0 cursor-default items-center gap-1.5 rounded-t-sm px-3 text-sm font-medium whitespace-nowrap text-muted-foreground transition-colors outline-none select-none hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring/50 data-selected:text-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
			className,
		)}
		{...props}
	/>
);

// The active underline. Base UI sets --active-tab-{left,width} on the indicator;
// data-instant suppresses the transition on first paint so it doesn't slide in
// from the origin. prefers-reduced-motion falls back to an instant move.
const TabsIndicator = ({ className, ...props }: TabsPrimitive.Indicator.Props) => (
	<TabsPrimitive.Indicator
		data-slot="tabs-indicator"
		className={cn(
			"absolute bottom-0 left-0 h-px w-(--active-tab-width) translate-x-(--active-tab-left) bg-foreground transition-[translate,width] duration-200 ease-out data-instant:transition-none motion-reduce:transition-none",
			className,
		)}
		{...props}
	/>
);

const TabsPanel = ({ className, ...props }: TabsPrimitive.Panel.Props) => (
	<TabsPrimitive.Panel
		data-slot="tabs-panel"
		className={cn("outline-none focus-visible:ring-1 focus-visible:ring-ring/50", className)}
		{...props}
	/>
);

export { Tabs, TabsIndicator, TabsList, TabsPanel, TabsTab };
