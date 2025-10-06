"use client";

import { useTheme } from "@/web/components/theme-provider";
import { Button } from "@/web/components/ui/button";

export function ModeToggle() {
	const { theme, setTheme } = useTheme();

	return (
		<Button
			size="icon"
			variant="ghost"
			onClick={() => setTheme(theme === "light" ? "dark" : "light")}
		>
			<span className="text-xl dark:hidden">☀️</span>
			<span className="hidden text-xl dark:block">🌙</span>
			<span className="sr-only">Toggle theme</span>
		</Button>
	);
}
