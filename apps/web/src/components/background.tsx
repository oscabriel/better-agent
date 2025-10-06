import type { CSSProperties, PropsWithChildren } from "react";
import { cn } from "@/web/utils/cn";

const patternMask =
	"linear-gradient(to top, rgba(0,0,0,1) 0%, rgba(0,0,0,0.85) 20%, rgba(0,0,0,0.55) 45%, rgba(0,0,0,0.2) 70%, rgba(0,0,0,0) 100%)";

export const appBackgroundStyle: CSSProperties = {
	backgroundImage: "url(/pattern.png)",
	backgroundRepeat: "repeat",
	backgroundSize: "1028px",
};

const backgroundMaskStyle: CSSProperties = {
	maskImage: patternMask,
	WebkitMaskImage: patternMask,
};

export function AppBackground() {
	return (
		<div
			aria-hidden="true"
			className="pointer-events-none fixed inset-0 z-0 overflow-hidden"
			style={backgroundMaskStyle}
		>
			<div
				className="-translate-x-1/2 -translate-y-1/2 absolute top-1/2 left-1/2 size-[160%] opacity-10 dark:opacity-25"
				style={{
					...appBackgroundStyle,
					transform: "rotate(-15deg)",
					transformOrigin: "center",
				}}
			/>
		</div>
	);
}

interface BackgroundLayoutProps extends PropsWithChildren {
	className?: string;
	contentClassName?: string;
}

export function BackgroundLayout({
	children,
	className,
	contentClassName,
}: BackgroundLayoutProps) {
	return (
		<div className={cn("relative min-h-screen bg-background", className)}>
			<AppBackground />
			<div className={cn("relative z-10", contentClassName)}>{children}</div>
		</div>
	);
}
