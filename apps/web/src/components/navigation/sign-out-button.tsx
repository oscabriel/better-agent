"use client";

import { LogOutIcon } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/web/components/ui/button";
import { authClient } from "@/web/lib/auth-client";

interface SignOutButtonProps {
	className?: string;
	variant?: "ghost" | "outline";
}

export function SignOutButton({
	className,
	variant = "ghost",
}: SignOutButtonProps) {
	const [isPending, startTransition] = useTransition();

	const handleSignOut = () => {
		startTransition(async () => {
			try {
				const { error } = await authClient.signOut();

				if (error) {
					console.error("Error signing out:", error);
					toast.error("Failed to sign out");
				} else {
					toast.success("Signed out successfully");
					window.location.href = "/auth/sign-in";
				}
			} catch (error) {
				console.error("Error signing out:", error);
				toast.error("Failed to sign out");
			}
		});
	};

	return (
		<Button
			variant={variant}
			onClick={handleSignOut}
			disabled={isPending}
			className={className}
		>
			<LogOutIcon className="mr-2 size-4" />
			{isPending ? "Signing out..." : "Sign Out"}
		</Button>
	);
}
