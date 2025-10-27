import { redirect } from "@tanstack/react-router";
import type { AuthContextValue } from "@/web/lib/auth-context";

interface RedirectIfAuthenticatedOptions {
	auth: AuthContextValue;
	to: string;
	replace?: boolean;
}

export function redirectIfAuthenticated({
	auth,
	to,
	replace,
}: RedirectIfAuthenticatedOptions) {
	if (auth.isPending) {
		return;
	}

	if (auth.isAuthenticated) {
		throw redirect({
			to,
			replace: replace ?? true,
		});
	}
}

interface RequireAuthenticatedOptions {
	auth: AuthContextValue;
	location: { href?: string | null; pathname?: string | null };
	signInPath?: string;
	redirectOverride?: string;
	replace?: boolean;
}

export function requireAuthenticated({
	auth,
	location,
	signInPath,
	redirectOverride,
	replace,
}: RequireAuthenticatedOptions) {
	if (auth.isPending) {
		return;
	}

	if (!auth.isAuthenticated) {
		const redirectTarget =
			redirectOverride ?? location.href ?? location.pathname ?? "/";

		throw redirect({
			to: signInPath ?? "/auth/sign-in",
			replace: replace ?? true,
			search: {
				redirect: redirectTarget,
			},
		});
	}
}
