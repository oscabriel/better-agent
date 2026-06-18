"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ComponentProps } from "react";

/**
 * Thin wrapper over next-themes so the app wires a single import and the theme
 * system stays a UI-package concern. Dark is the primary theme (DESIGN.md §2);
 * the light token block in globals.css keeps light mode one toggle away.
 */
export const ThemeProvider = ({
	children,
	...props
}: ComponentProps<typeof NextThemesProvider>) => (
	<NextThemesProvider {...props}>{children}</NextThemesProvider>
);
