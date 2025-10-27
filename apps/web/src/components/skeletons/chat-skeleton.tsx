export function ChatPageSkeleton() {
	return (
		<div className="flex h-full flex-col overflow-hidden">
			{/* Header skeleton */}
			<div className="flex items-center justify-between border-b px-4 py-3 sm:px-6">
				<div className="h-6 w-32 animate-pulse rounded bg-muted" />
				<div className="h-8 w-8 animate-pulse rounded bg-muted" />
			</div>
			{/* Messages area skeleton */}
			<div className="flex-1" />
			{/* Composer skeleton */}
			<div className="shrink-0 border-t bg-background/60 px-4 py-4 sm:px-6">
				<div className="h-10 w-full animate-pulse rounded-lg bg-muted" />
			</div>
		</div>
	);
}
