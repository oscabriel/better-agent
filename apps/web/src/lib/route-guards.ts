import { redirect } from "@tanstack/react-router";
import type { AuthContextValue } from "@/web/components/auth-provider";

interface RedirectIfAuthenticatedOptions {
	auth: AuthContextValue;
	to: string;
}

export function redirectIfAuthenticated({
	auth,
	to,
}: RedirectIfAuthenticatedOptions) {
	if (auth.isAuthenticated) {
		throw redirect({
			to,
			replace: true,
		});
	}
}

interface RequireAuthenticatedOptions {
	auth: AuthContextValue;
	location: { href?: string | null; pathname?: string | null };
}

export function requireAuthenticated({
	auth,
	location,
}: RequireAuthenticatedOptions) {
	if (!auth.isAuthenticated) {
		const redirectTarget = location.href ?? location.pathname ?? "/";

		throw redirect({
			to: "/auth/sign-in",
			replace: true,
			search: {
				redirect: redirectTarget,
			},
		});
	}
}
