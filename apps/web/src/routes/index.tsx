import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@better-agent/ui/components/card";
import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";

import { orpc } from "@/utils/orpc";

const HomeComponent = () => {
	const healthCheck = useQuery(orpc.healthCheck.queryOptions());

	let statusText = "Disconnected";
	if (healthCheck.isLoading) {
		statusText = "Checking...";
	} else if (healthCheck.data) {
		statusText = "Connected";
	}

	return (
		<div className="mx-auto grid w-full max-w-5xl gap-8 px-4 py-12">
			<section className="grid gap-4">
				<p className="text-muted-foreground text-xs uppercase tracking-[0.28em]">Better Agent</p>
				<div className="grid max-w-3xl gap-3">
					<h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
						Scoped agents for durable thinking work.
					</h1>
					<p className="text-muted-foreground text-base leading-7">
						Create Thinkspaces around bounded Goals, configure scoped Permissions, and keep Sources,
						Memory, Skills, Artifacts, and the Audit Trail connected to the work.
					</p>
				</div>
				<div className="flex flex-wrap gap-2">
					<Link
						className="inline-flex h-8 items-center justify-center border border-transparent bg-primary px-2.5 text-primary-foreground text-xs font-medium transition-colors hover:bg-primary/80"
						to="/thinkspaces"
					>
						Open Thinkspaces
					</Link>
					<Link
						className="inline-flex h-8 items-center justify-center border border-border bg-background px-2.5 text-xs font-medium transition-colors hover:bg-muted hover:text-foreground"
						to="/login"
					>
						Sign in
					</Link>
				</div>
			</section>

			<div className="grid gap-4 md:grid-cols-[2fr_1fr]">
				<Card>
					<CardHeader>
						<CardTitle>Baseline rewrite direction</CardTitle>
						<CardDescription>
							This branch is the Better Agent implementation base. The product surface is now
							oriented around Thinkspaces instead of scaffold demos.
						</CardDescription>
					</CardHeader>
					<CardContent className="grid gap-3 sm:grid-cols-3">
						<div className="border border-border p-3">
							<h2 className="font-medium">Coordinator</h2>
							<p className="mt-1 text-muted-foreground">Sets up and routes between Thinkspaces.</p>
						</div>
						<div className="border border-border p-3">
							<h2 className="font-medium">Thinkspace Agent</h2>
							<p className="mt-1 text-muted-foreground">
								Performs bounded work inside one Thinkspace.
							</p>
						</div>
						<div className="border border-border p-3">
							<h2 className="font-medium">Approval</h2>
							<p className="mt-1 text-muted-foreground">
								External mutations default to draft or explicit consent.
							</p>
						</div>
					</CardContent>
				</Card>

				<Card size="sm">
					<CardHeader>
						<CardTitle>API Status</CardTitle>
						<CardDescription>Control-plane health check</CardDescription>
					</CardHeader>
					<CardContent>
						<div className="flex items-center gap-2">
							<div
								className={`h-2 w-2 rounded-full ${healthCheck.data ? "bg-green-500" : "bg-red-500"}`}
							/>
							<span className="text-muted-foreground text-sm">{statusText}</span>
						</div>
					</CardContent>
				</Card>
			</div>
		</div>
	);
};

export const Route = createFileRoute("/")({
	component: HomeComponent,
});
