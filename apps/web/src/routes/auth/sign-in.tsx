import { createFileRoute } from "@tanstack/react-router";
import { SignInShellSkeleton } from "@/web/components/skeletons/sign-in-skeleton";
import { redirectIfAuthenticated } from "@/web/lib/route-guards";
import { SignInForm } from "./-components/sign-in-form";

interface SignInSearch {
	redirect?: string;
}

const FALLBACK_REDIRECT = "/chat";

function sanitizeRedirect(rawRedirect: string | undefined): string {
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

export const Route = createFileRoute("/auth/sign-in")({
	validateSearch: (search: Record<string, unknown>): SignInSearch => {
		const redirectValue = sanitizeRedirect(
			search.redirect as string | undefined,
		);
		if (redirectValue === FALLBACK_REDIRECT) {
			return {};
		}
		return {
			redirect: redirectValue,
		};
	},
	beforeLoad: (opts) => {
		redirectIfAuthenticated({
			auth: opts.context.auth,
			to: opts.search.redirect || FALLBACK_REDIRECT,
		});
	},
	component: SignInRoute,
	pendingComponent: SignInShellSkeleton,
});

function SignInRoute() {
	const search = Route.useSearch();

	return (
		<div className="container mx-auto w-full min-w-0 max-w-[90vw] px-3 py-2 sm:max-w-2xl sm:px-4 md:max-w-3xl">
			<SignInForm redirectPath={search.redirect || FALLBACK_REDIRECT} />
		</div>
	);
}
