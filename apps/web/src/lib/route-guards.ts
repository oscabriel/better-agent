import { redirect } from "@tanstack/react-router";
import type { QueryClient } from "@tanstack/react-query";
import type { authClient } from "@/web/lib/auth-client";

interface RedirectIfAuthenticatedOptions {
	authClient: typeof authClient;
	queryClient: QueryClient;
	to: string;
}

export async function redirectIfAuthenticated({
	authClient,
	queryClient,
	to,
}: RedirectIfAuthenticatedOptions) {
	// Wrap in React Query for deduplication
	const session = await queryClient.ensureQueryData({
		queryKey: ['auth', 'session'],
		queryFn: async () => {
			const { data, error } = await authClient.getSession();
			if (error) {
				console.error("Failed to fetch auth session", error);
			}
			return data;
		},
		staleTime: 5 * 60 * 1000, // 5 minutes
	});

	if (session) {
		throw redirect({
			to,
			replace: true,
		});
	}
}

interface RequireAuthenticatedOptions {
	authClient: typeof authClient;
	queryClient: QueryClient;
	location: { href?: string | null; pathname?: string | null };
}

export async function requireAuthenticated({
	authClient,
	queryClient,
	location,
}: RequireAuthenticatedOptions) {
	// Wrap in React Query for deduplication
	const session = await queryClient.ensureQueryData({
		queryKey: ['auth', 'session'],
		queryFn: async () => {
			const { data, error } = await authClient.getSession();
			if (error) {
				console.error("Failed to fetch auth session", error);
			}
			return data;
		},
		staleTime: 5 * 60 * 1000, // 5 minutes
	});

	if (!session) {
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
