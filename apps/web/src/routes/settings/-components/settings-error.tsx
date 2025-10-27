import type { ErrorComponentProps } from "@tanstack/react-router";
import { useRouter } from "@tanstack/react-router";
import { AlertCircle, ArrowLeft, RefreshCw } from "lucide-react";
import { Button } from "@/web/components/ui/button";

export function SettingsError({ error, reset }: ErrorComponentProps) {
	const router = useRouter();

	return (
		<div className="flex h-full items-center justify-center p-4">
			<div className="w-full max-w-md space-y-6 rounded-lg border border-border bg-card p-6 text-center shadow-lg">
				{/* Error Icon */}
				<div className="flex justify-center">
					<div className="rounded-full bg-destructive/10 p-3">
						<AlertCircle className="size-10 text-destructive" />
					</div>
				</div>

				{/* Error Message */}
				<div className="space-y-2">
					<h2 className="font-semibold text-xl">Failed to load settings</h2>
					<p className="text-muted-foreground text-sm">
						We couldn't load your settings. Please try again or contact support
						if the problem persists.
					</p>
				</div>

				{/* Error Details (in development) */}
				{import.meta.env.DEV && error && (
					<div className="rounded-md bg-muted p-3 text-left">
						<p className="break-all font-mono text-destructive text-xs">
							{error.message || String(error)}
						</p>
					</div>
				)}

				{/* Action Buttons */}
				<div className="flex flex-col gap-2 sm:flex-row">
					<Button onClick={() => reset()} variant="default" className="gap-2">
						<RefreshCw className="size-4" />
						Try Again
					</Button>
					<Button
						onClick={() => router.navigate({ to: "/chat" })}
						variant="outline"
						className="gap-2"
					>
						<ArrowLeft className="size-4" />
						Back to Chat
					</Button>
				</div>
			</div>
		</div>
	);
}
