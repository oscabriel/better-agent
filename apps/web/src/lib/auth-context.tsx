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

export function AuthProvider({ children }: PropsWithChildren) {
	const {
		data: sessionFromHook,
		isPending,
		error,
		refetch,
	} = authClient.useSession();
	const sessionData = sessionFromHook as AuthSession | null;
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
		if (ensureSessionPromiseRef.current) {
			return ensureSessionPromiseRef.current;
		}

		const promise = (async () => {
			try {
				const result = await authClient.getSession();
				const nextSession = (
					result && "data" in result ? result.data : result
				) as AuthSession | null;
				setHasHydrated(true);
				if (typeof refetch === "function") {
					const currentUserId = sessionData?.user?.id ?? null;
					const nextUserId = nextSession?.user?.id ?? null;
					if (currentUserId && nextUserId && currentUserId !== nextUserId) {
						await refetch();
					}
				}
				return nextSession ?? null;
			} catch (fetchError) {
				console.error("Failed to ensure auth session", fetchError);
				return null;
			} finally {
				ensureSessionPromiseRef.current = null;
			}
		})();

		ensureSessionPromiseRef.current = promise;
		return promise;
	}, [refetch, sessionData?.user?.id]);

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
