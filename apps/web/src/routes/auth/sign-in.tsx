import { createFileRoute, Navigate } from "@tanstack/react-router";
import { authClient } from "@/web/lib/auth-client";
import { redirectIfAuthenticated } from "@/web/lib/route-guards";
import { SignInShellSkeleton } from "@/web/routes/auth/-components/sign-in-skeleton";
import { SignInForm } from "./-components/sign-in-form";

interface SignInSearch {
	redirect?: string;
}

const FALLBACK_REDIRECT = "/chat";

export const Route = createFileRoute("/auth/sign-in")({
	beforeLoad: async (opts) => {
		const search = opts.search as SignInSearch | undefined;
		const redirectPath = sanitizeRedirect(search?.redirect);
		await redirectIfAuthenticated({
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
	const { data: session, isPending } = authClient.useSession();
	if (isPending) {
		return (
			<div className="container mx-auto w-full min-w-0 max-w-[90vw] px-3 py-2 sm:max-w-2xl sm:px-4 md:max-w-3xl">
				<SignInShellSkeleton />
			</div>
		);
	}

	if (session?.user) {
		return <Navigate to={redirectPath} replace />;
	}

	return (
		<div className="container mx-auto w-full min-w-0 max-w-[90vw] px-3 py-2 sm:max-w-2xl sm:px-4 md:max-w-3xl">
			<SignInForm redirectPath={redirectPath} />
		</div>
	);
}
