import { createFileRoute } from "@tanstack/react-router";
import { requireAuthenticated } from "@/web/lib/route-guards";

export const Route = createFileRoute("/settings")({
	beforeLoad: async (opts) => {
		await requireAuthenticated({
			auth: opts.context.auth,
			location: opts.location,
		});
	},
});
