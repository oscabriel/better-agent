import { Button } from "@better-agent/ui/components/button";
import { Separator } from "@better-agent/ui/components/separator";
import { createFileRoute, Link, Outlet, redirect } from "@tanstack/react-router";

import { getUser } from "@/functions/get-user";

const settingsNavItems = [
	{
		description: "Profile, sign-out, and account identity.",
		label: "Account",
		to: "/settings/profile",
	},
	{
		description: "Product defaults and Connected Accounts, separate from Thinkspace Permissions.",
		label: "Product settings",
		to: "/settings/product",
	},
] as const;

const SettingsLayout = () => (
	<div className="mx-auto grid w-full max-w-6xl gap-6 px-4 py-8 md:grid-cols-[16rem_minmax(0,1fr)]">
		<aside className="grid content-start gap-4 border border-border bg-card p-4">
			<div className="grid gap-1">
				<p className="text-muted-foreground text-xs uppercase tracking-[0.24em]">Better Agent</p>
				<h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
				<p className="text-muted-foreground text-sm leading-6">
					Manage account-level configuration. Thinkspace Permissions stay scoped to each Thinkspace.
				</p>
			</div>
			<Separator />
			<nav aria-label="Settings" className="grid gap-2">
				{settingsNavItems.map((item) => (
					<Button
						className="h-auto justify-start p-0 text-left"
						key={item.to}
						render={
							<Link
								activeProps={{ className: "bg-primary text-primary-foreground" }}
								to={item.to}
							/>
						}
						variant="ghost"
					>
						<span className="grid gap-0.5 px-3 py-2">
							<span>{item.label}</span>
							<span className="text-xs opacity-75">{item.description}</span>
						</span>
					</Button>
				))}
			</nav>
		</aside>
		<section className="min-w-0 border border-border bg-card p-4 sm:p-6">
			<Outlet />
		</section>
	</div>
);

export const Route = createFileRoute("/settings")({
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
	component: SettingsLayout,
});
