import { Button } from "@better-agent/ui/components/button";
import { Link, createFileRoute } from "@tanstack/react-router";

const HomeComponent = () => (
	<div className="mx-auto grid w-full max-w-2xl content-center gap-6 px-4 py-24">
		<div className="grid gap-3">
			<h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
				Better Agent
			</h1>
			<p className="max-w-lg text-muted-foreground text-sm leading-relaxed">
				Scoped agents for durable thinking work. Create Thinkspaces around bounded Goals,
				configure Permissions, and return when work needs your judgement.
			</p>
		</div>
		<div className="flex gap-2">
			<Button render={<Link to="/thinkspaces" />}>Open Thinkspaces</Button>
			<Button variant="outline" render={<Link to="/login" />}>
				Sign in
			</Button>
		</div>
	</div>
);

export const Route = createFileRoute("/")({
	component: HomeComponent,
});
