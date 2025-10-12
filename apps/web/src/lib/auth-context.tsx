import type { PropsWithChildren } from "react";
import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { authClient } from "@/web/lib/auth-client";

export type AuthSession = typeof authClient.$Infer.Session;

type AuthStatus = "loading" | "authenticated" | "unauthenticated";

export interface AuthContextValue {
	status: AuthStatus;
	session: AuthSession | null;
	hasHydrated: boolean;
	ensureSession: () => Promise<AuthSession | null>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

// Type guard for Better Auth session response
function extractSessionData(sessionResult: unknown): AuthSession | null {
	if (!sessionResult) return null;

	// Better Auth can return { data: session } or just session
	if (
		typeof sessionResult === "object" &&
		sessionResult !== null &&
		"data" in sessionResult
	) {
		return (sessionResult.data as AuthSession) ?? null;
	}

	return sessionResult as AuthSession;
}

export function AuthProvider({ children }: PropsWithChildren) {
	const { data: sessionFromHook, isPending, error } = authClient.useSession();
	const sessionData = extractSessionData(sessionFromHook);
	const [hasHydrated, setHasHydrated] = useState(() => !isPending);
	const ensureSessionPromiseRef = useRef<Promise<AuthSession | null> | null>(
		null,
	);

	useEffect(() => {
		if (!isPending) {
			setHasHydrated(true);
		}
	}, [isPending]);

	const ensureSession = useCallback(async () => {
		// If already have data and not pending, return immediately
		if (sessionData && !isPending) {
			return sessionData;
		}

		// If there's an ongoing ensureSession call, return it to prevent duplicates
		if (ensureSessionPromiseRef.current) {
			return ensureSessionPromiseRef.current;
		}

		// Create new fetch promise
		const promise = (async () => {
			try {
				const result = await authClient.getSession();
				const nextSession = extractSessionData(result);
				setHasHydrated(true);
				return nextSession;
			} catch (fetchError) {
				console.error("Failed to ensure auth session", fetchError);
				return null;
			} finally {
				ensureSessionPromiseRef.current = null;
			}
		})();

		ensureSessionPromiseRef.current = promise;
		return promise;
	}, [sessionData, isPending]);

	const status: AuthStatus = useMemo(() => {
		if (isPending) {
			return "loading";
		}
		return sessionData?.user ? "authenticated" : "unauthenticated";
	}, [isPending, sessionData?.user]);

	const value = useMemo<AuthContextValue>(
		() => ({
			status,
			session: sessionData,
			hasHydrated,
			ensureSession,
		}),
		[ensureSession, hasHydrated, sessionData, status],
	);

	if (error) {
		console.error("Failed to fetch auth session", error);
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
