import type { PropsWithChildren } from "react";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { authClient } from "@/web/lib/auth-client";

export type AuthSession = typeof authClient.$Infer.Session;

export interface AuthContextValue {
	isAuthenticated: boolean;
	session: AuthSession | null;
	isPending: boolean;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: PropsWithChildren) {
	const { data: session, isPending, error } = authClient.useSession();
	const [hasInitiallyLoaded, setHasInitiallyLoaded] = useState(false);

	// Track when initial auth load completes
	useEffect(() => {
		if (!isPending && !hasInitiallyLoaded) {
			setHasInitiallyLoaded(true);
		}
	}, [isPending, hasInitiallyLoaded]);

	const value = useMemo<AuthContextValue>(
		() => ({
			isAuthenticated: !!session?.user,
			session: session ?? null,
			isPending,
		}),
		[session, isPending],
	);

	if (error) {
		console.error("Failed to fetch auth session", error);
	}

	// Show empty div during initial auth load to prevent flashing
	// Route guards now check isPending, so this is purely to avoid content flash
	if (!hasInitiallyLoaded && isPending) {
		return <div />;
	}

	return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
	const context = useContext(AuthContext);
	if (!context) {
		throw new Error("useAuth must be used within an AuthProvider");
	}
	return context;
}
