import { createFileRoute } from "@tanstack/react-router";
import { requireAuthenticated } from "@/web/lib/route-guards";

export const Route = createFileRoute("/settings")({
	beforeLoad: (opts) => {
		requireAuthenticated({
			auth: opts.context.auth,
			location: opts.location,
		});
	},
});
