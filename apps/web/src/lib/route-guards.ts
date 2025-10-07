import { redirect } from "@tanstack/react-router";
import type { AuthContextValue } from "@/web/lib/auth-context";

async function resolveSession(auth: AuthContextValue) {
	if (auth.status === "authenticated" && auth.session) {
		return auth.session;
	}

	if (!auth.hasHydrated) {
		const ensured = await auth.ensureSession();
		if (ensured) {
			return ensured;
		}
		return auth.session ?? null;
	}

	return auth.session ?? null;
}

interface RedirectIfAuthenticatedOptions {
	auth: AuthContextValue;
	to: string;
	replace?: boolean;
}

export async function redirectIfAuthenticated({
	auth,
	to,
	replace,
}: RedirectIfAuthenticatedOptions) {
	const session = await resolveSession(auth);
	if (session?.user) {
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

export async function requireAuthenticated({
	auth,
	location,
	signInPath,
	redirectOverride,
	replace,
}: RequireAuthenticatedOptions) {
	const session = await resolveSession(auth);
	if (session?.user) {
		return;
	}

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
