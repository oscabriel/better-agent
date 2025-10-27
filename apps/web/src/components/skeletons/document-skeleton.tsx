import { Skeleton } from "@/web/components/ui/skeleton";

export function DocumentSkeleton() {
	return (
		<div className="min-h-screen">
			<div className="mx-auto max-w-4xl px-8 py-32">
				{/* Header */}
				<header className="mb-24 space-y-2">
					<Skeleton className="h-6 w-48" />
					<Skeleton className="h-4 w-32" />
				</header>

				{/* Content Sections */}
				<div className="space-y-12">
					{[
						"section-1",
						"section-2",
						"section-3",
						"section-4",
						"section-5",
					].map((id) => (
						<section key={id} className="space-y-4">
							<Skeleton className="h-5 w-40" />
							<div className="space-y-2">
								<Skeleton className="h-4 w-full" />
								<Skeleton className="h-4 w-full" />
								<Skeleton className="h-4 w-3/4" />
							</div>
						</section>
					))}
				</div>
			</div>
		</div>
	);
}
