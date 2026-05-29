import { Button } from "@better-agent/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@better-agent/ui/components/card";
import { createFileRoute, getRouteApi, redirect } from "@tanstack/react-router";

import { getUser } from "@/functions/get-user";

const routeApi = getRouteApi("/thinkspaces");

const RouteComponent = () => {
	const { session } = routeApi.useRouteContext();
	const displayName = session?.user.name || session?.user.email || "there";

	return (
		<div className="mx-auto grid w-full max-w-5xl gap-6 px-4 py-8">
			<section className="grid gap-2">
				<p className="text-muted-foreground text-xs uppercase tracking-[0.24em]">Better Agent</p>
				<h1 className="text-3xl font-semibold tracking-tight">Thinkspaces</h1>
				<p className="max-w-2xl text-muted-foreground text-sm leading-6">
					Welcome back, {displayName}. Thinkspaces are durable environments for scoped agent work
					around a bounded Goal.
				</p>
			</section>

			<Card>
				<CardHeader>
					<CardTitle>No Thinkspaces yet</CardTitle>
					<CardDescription>
						The next slice will add the Thinkspace lifecycle: create, review, list, open, and
						archive. This baseline keeps the authenticated product direction centered on Thinkspaces
						instead of scaffold demos.
					</CardDescription>
				</CardHeader>
				<CardContent className="grid gap-4 sm:grid-cols-3">
					<div className="border border-border p-3">
						<h2 className="font-medium">Goal</h2>
						<p className="mt-1 text-muted-foreground">
							Each Thinkspace starts from one bounded, assessable outcome.
						</p>
					</div>
					<div className="border border-border p-3">
						<h2 className="font-medium">Permissions</h2>
						<p className="mt-1 text-muted-foreground">
							Connected Accounts do not grant access until a Thinkspace receives scoped Permissions.
						</p>
					</div>
					<div className="border border-border p-3">
						<h2 className="font-medium">Artifacts</h2>
						<p className="mt-1 text-muted-foreground">
							Durable outputs will live with Sources, Memory, Skills, Approvals, and the Audit
							Trail.
						</p>
					</div>
					<Button className="w-fit" disabled type="button">
						Create Thinkspace coming soon
					</Button>
				</CardContent>
			</Card>
		</div>
	);
};

export const Route = createFileRoute("/thinkspaces")({
	beforeLoad: async ({ location }) => {
		const session = await getUser();
		if (!session) {
			throw redirect({
				search: { redirect: location.href },
				to: "/login",
			});
		}
		return { session };
	},
	component: RouteComponent,
});
