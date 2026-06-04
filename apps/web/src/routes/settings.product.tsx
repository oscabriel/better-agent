import { Badge } from "@better-agent/ui/components/badge";
import { Button } from "@better-agent/ui/components/button";
import { Separator } from "@better-agent/ui/components/separator";
import { createFileRoute } from "@tanstack/react-router";

const RouteComponent = () => (
	<div className="grid gap-6">
		<div className="grid gap-1">
			<h2 className="text-xl font-semibold tracking-tight">Product settings</h2>
			<p className="text-muted-foreground text-sm leading-6">
				Configure product-level defaults and Connected Accounts. These choices prepare Better Agent,
				but a Thinkspace Agent still needs scoped Permissions before it can use a resource.
			</p>
		</div>

		<section className="grid gap-3" aria-labelledby="product-defaults-heading">
			<div className="flex items-center justify-between gap-3 border border-border p-4">
				<div className="grid gap-1">
					<div className="flex flex-wrap items-center gap-2">
						<h3 id="product-defaults-heading" className="font-medium">
							Coordinator defaults
						</h3>
						<Badge variant="outline">Coming next</Badge>
					</div>
					<p className="text-muted-foreground text-sm leading-6">
						Future defaults for model preference and product-wide review posture. They are not
						standing approvals for any Thinkspace.
					</p>
				</div>
				<span
					aria-label="Coordinator defaults placeholder"
					className="inline-flex h-5 w-9 items-center border border-border bg-muted opacity-50"
					role="switch"
					aria-checked="false"
				>
					<span className="ml-0.5 size-4 bg-muted-foreground/40" />
				</span>
			</div>
		</section>

		<Separator />

		<section className="grid gap-3" aria-labelledby="connected-accounts-heading">
			<div className="grid gap-1">
				<h3 id="connected-accounts-heading" className="font-medium">
					Connected Accounts
				</h3>
				<p className="text-muted-foreground text-sm leading-6">
					Connect external services at the product level first. Later, grant narrow Thinkspace
					Permissions from inside a Thinkspace.
				</p>
			</div>
			<div className="grid gap-2">
				<div className="flex flex-col gap-3 border border-border p-4 sm:flex-row sm:items-center sm:justify-between">
					<div className="grid gap-1">
						<p className="font-medium">GitHub</p>
						<p className="text-muted-foreground text-sm">
							Not connected. Connecting here will not grant repository access to any Thinkspace by
							itself.
						</p>
					</div>
					<Button disabled type="button" variant="outline">
						Connect later
					</Button>
				</div>
				<div className="flex flex-col gap-3 border border-border p-4 sm:flex-row sm:items-center sm:justify-between">
					<div className="grid gap-1">
						<p className="font-medium">Local Node</p>
						<p className="text-muted-foreground text-sm">
							No Local Node registered. Local resources will require scoped Permissions per
							Thinkspace.
						</p>
					</div>
					<Button disabled type="button" variant="outline">
						Register later
					</Button>
				</div>
			</div>
		</section>
	</div>
);

export const Route = createFileRoute("/settings/product")({
	component: RouteComponent,
});
