import type { PropsWithChildren } from "react";
import { createContext, useContext, useMemo } from "react";
import { AppBackground } from "@/web/components/background";
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

	// Block rendering until auth resolves (prevents race condition in route guards)
	if (isPending) {
		return (
			<div className="relative min-h-screen bg-background">
				<AppBackground />
			</div>
		);
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
