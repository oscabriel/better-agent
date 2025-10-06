import { useMutation, useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/web/components/ui/badge";
import { Button } from "@/web/components/ui/button";
import { authClient } from "@/web/lib/auth-client";
import { orpc } from "@/web/lib/orpc";
import type { Session } from "@/web/types/user";
import { getDeviceIcon } from "./utils";

function SessionItem({
	session,
	isCurrentSession,
	isTerminating,
	onTerminate,
	isPending,
}: {
	session: Session;
	isCurrentSession: boolean;
	isTerminating: boolean;
	onTerminate: (session: Session) => void;
	isPending: boolean;
}) {
	const deviceInfo = useQuery({
		...orpc.profile.getDeviceInfo.queryOptions({
			input: {
				userAgent: session.userAgent || null,
			},
		}),
		enabled: !!session.userAgent,
		staleTime: 5 * 60 * 1000, // Cache for 5 minutes
		retry: 1, // Only retry once
	});

	return (
		<div className="flex items-center justify-between rounded border p-2">
			<div className="flex items-center gap-2">
				{getDeviceIcon(session.userAgent)}
				<span className="text-sm">
					{deviceInfo.isLoading
						? "Loading..."
						: deviceInfo.data || "Unknown Device"}
				</span>
				{isCurrentSession && (
					<Badge variant="default" className="text-xs">
						Current
					</Badge>
				)}
			</div>
			<div className="flex items-center gap-2">
				<Button
					variant="ghost"
					size="sm"
					className="text-red-500 text-xs hover:bg-red-50"
					onClick={() => onTerminate(session)}
					disabled={isTerminating || isPending}
				>
					{isTerminating ? (
						<>
							<Loader2 size={15} className="mr-1 animate-spin" />
							{isCurrentSession ? "Signing out..." : "Terminating..."}
						</>
					) : isCurrentSession ? (
						"Sign Out"
					) : (
						"Terminate"
					)}
				</Button>
			</div>
		</div>
	);
}

export function SessionManager() {
	const [terminatingSession, setTerminatingSession] = useState<string>();
	const { data: currentUser } = authClient.useSession();

	const sessions = useQuery({
		...orpc.profile.listSessions.queryOptions(),
		refetchOnWindowFocus: true,
	});

	const revokeSessionMutation = useMutation(
		orpc.profile.revokeSession.mutationOptions({
			onSuccess: () => {
				toast.success("Session terminated successfully");
				sessions.refetch();
				setTerminatingSession(undefined);
			},
			onError: (error) => {
				toast.error(error.message);
				setTerminatingSession(undefined);
			},
		}),
	);

	const handleSessionTerminate = async (session: Session) => {
		const sessionId = session.id || session.token;
		setTerminatingSession(sessionId);

		const isCurrentSession = session.token === currentUser?.session?.token;

		if (isCurrentSession) {
			await authClient.signOut({
				fetchOptions: {
					onSuccess: () => {
						toast.success("Signed out successfully");
						window.location.href = "/auth/sign-in";
					},
					onError: () => {
						toast.error("Failed to sign out");
						setTerminatingSession(undefined);
					},
				},
			});
		} else {
			revokeSessionMutation.mutate({ token: session.token });
		}
	};

	const validSessions = (sessions.data || []).filter(
		(session) => session.userAgent != null,
	);

	return (
		<div className="flex w-full flex-col gap-3">
			<h3 className="font-medium text-sm">Active Sessions</h3>
			{sessions.isLoading ? (
				<p className="text-muted-foreground text-xs">Loading sessions...</p>
			) : sessions.error ? (
				<p className="text-muted-foreground text-xs">Error loading sessions</p>
			) : validSessions.length === 0 ? (
				<p className="text-muted-foreground text-xs">
					No active sessions found.
				</p>
			) : (
				<div className="space-y-2 bg-background/60">
					{validSessions.map((session, index) => {
						const isCurrentSession =
							session.token === currentUser?.session?.token;
						const sessionId = session.id || session.token;
						const isTerminating = terminatingSession === sessionId;

						return (
							<SessionItem
								key={session.id || session.token || index}
								session={session}
								isCurrentSession={isCurrentSession}
								isTerminating={isTerminating}
								onTerminate={handleSessionTerminate}
								isPending={revokeSessionMutation.isPending}
							/>
						);
					})}
				</div>
			)}
		</div>
	);
}
