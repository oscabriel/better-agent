import { Separator } from "@better-agent/ui/components/separator";
import { createFileRoute, Link, Outlet, redirect } from "@tanstack/react-router";

import { getUser } from "@/functions/get-user";

const settingsNavItems = [
	{
		description: "Profile and session controls.",
		label: "Account",
		to: "/settings/profile",
	},
	{
		description: "Connected Accounts and model credentials.",
		label: "Product",
		to: "/settings/product",
	},
] as const;

const SettingsLayout = () => (
	<div className="mx-auto grid w-full max-w-4xl gap-8 px-4 py-8 md:grid-cols-[14rem_minmax(0,1fr)]">
		<aside className="grid content-start gap-4">
			<div className="grid gap-1">
				<h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
				<p className="text-muted-foreground text-sm leading-relaxed">
					Account-level configuration. Thinkspace Permissions stay scoped to each Thinkspace.
				</p>
			</div>
			<Separator />
			<nav aria-label="Settings" className="grid gap-1">
				{settingsNavItems.map((item) => (
					<Link
						activeProps={{ className: "bg-muted text-foreground" }}
						className="grid gap-0.5 px-3 py-2 text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
						key={item.to}
						to={item.to}
					>
						<span className="text-sm font-medium">{item.label}</span>
						<span className="text-xs opacity-75">{item.description}</span>
					</Link>
				))}
			</nav>
		</aside>
		<section className="min-w-0">
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
