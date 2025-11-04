import { useEffect, useState } from "react";
import { AppBackground } from "@/web/components/background";

interface AppLoadingScreenProps {
	delayMs?: number;
}

export function AppLoadingScreen({ delayMs = 500 }: AppLoadingScreenProps) {
	const [showContent, setShowContent] = useState(false);

	useEffect(() => {
		const timer = setTimeout(() => {
			setShowContent(true);
		}, delayMs);

		return () => clearTimeout(timer);
	}, [delayMs]);

	return (
		<div className="relative flex min-h-screen items-center justify-center bg-background">
			<AppBackground />

			{/* Only show branded content after delay */}
			<div
				className="relative z-10 flex flex-col items-center gap-6 px-4 transition-opacity duration-300"
				style={{
					opacity: showContent ? 1 : 0,
				}}
			>
				<div className="flex items-center gap-3">
					<img src="/BCDO.png" alt="Better Chat" className="h-12 w-12" />
					<div className="flex flex-col">
						<h1 className="font-mono text-2xl font-semibold tracking-tight">
							better-chat
						</h1>
						<p className="font-mono text-sm text-muted-foreground">
							better chat through durable objects
						</p>
					</div>
				</div>

				<div className="flex items-center gap-2">
					<div className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
					<div
						className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary"
						style={{ animationDelay: "150ms" }}
					/>
					<div
						className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary"
						style={{ animationDelay: "300ms" }}
					/>
				</div>
			</div>
		</div>
	);
}
