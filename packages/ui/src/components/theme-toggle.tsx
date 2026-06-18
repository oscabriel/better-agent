"use client";

import { Button } from "@better-agent/ui/components/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@better-agent/ui/components/dropdown-menu";
import { CheckIcon, MonitorIcon, MoonIcon, SunIcon } from "lucide-react";
import { useTheme } from "next-themes";

const THEME_OPTIONS = [
	{ icon: SunIcon, label: "Light", value: "light" },
	{ icon: MoonIcon, label: "Dark", value: "dark" },
	{ icon: MonitorIcon, label: "System", value: "system" },
] as const;

/**
 * Light / Dark / System switch. The trigger glyph is CSS-driven off the `.dark`
 * class next-themes sets, so it needs no mount guard and never flashes; the
 * checkmark reads `theme`, which is safe because menu content only renders once
 * opened (always post-hydration).
 */
export const ThemeToggle = () => {
	const { setTheme, theme } = useTheme();

	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				render={<Button aria-label="Switch theme" size="icon" variant="ghost" />}
			>
				<SunIcon className="dark:hidden" />
				<MoonIcon className="hidden dark:block" />
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="min-w-36">
				{THEME_OPTIONS.map(({ icon: Icon, label, value }) => (
					<DropdownMenuItem
						className="justify-between gap-6"
						key={value}
						onClick={() => setTheme(value)}
					>
						<span className="flex items-center gap-2">
							<Icon />
							{label}
						</span>
						{theme === value ? <CheckIcon className="size-3.5 text-muted-foreground" /> : null}
					</DropdownMenuItem>
				))}
			</DropdownMenuContent>
		</DropdownMenu>
	);
};
