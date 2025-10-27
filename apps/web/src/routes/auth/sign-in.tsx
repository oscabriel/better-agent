import { createFileRoute } from "@tanstack/react-router";
import { redirectIfAuthenticated } from "@/web/lib/route-guards";
import { SignInShellSkeleton } from "@/web/routes/auth/-components/sign-in-skeleton";
import { SignInForm } from "./-components/sign-in-form";

interface SignInSearch {
	redirect?: string;
}

const FALLBACK_REDIRECT = "/chat";

export const Route = createFileRoute("/auth/sign-in")({
	beforeLoad: (opts) => {
		const search = opts.search as SignInSearch | undefined;
		const redirectPath = sanitizeRedirect(search?.redirect);
		redirectIfAuthenticated({
			auth: opts.context.auth,
			to: redirectPath,
		});
	},
	component: SignInRoute,
	pendingComponent: SignInShellSkeleton,
});

function sanitizeRedirect(rawRedirect: string | undefined) {
	if (!rawRedirect || typeof rawRedirect !== "string") {
		return FALLBACK_REDIRECT;
	}

	if (!rawRedirect.startsWith("/")) {
		return FALLBACK_REDIRECT;
	}

	if (rawRedirect === "/auth/sign-in") {
		return FALLBACK_REDIRECT;
	}

	return rawRedirect;
}

function SignInRoute() {
	const search = Route.useSearch() as SignInSearch;
	const redirectPath = sanitizeRedirect(search.redirect);

	return (
		<div className="container mx-auto w-full min-w-0 max-w-[90vw] px-3 py-2 sm:max-w-2xl sm:px-4 md:max-w-3xl">
			<SignInForm redirectPath={redirectPath} />
		</div>
	);
}
