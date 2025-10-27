import { LogOutIcon } from "lucide-react";
import { useState } from "react";
import { Button } from "@/web/components/ui/button";
import { authClient } from "@/web/lib/auth-client";

interface SignOutButtonProps {
	className?: string;
	variant?: "ghost" | "outline";
	redirectTo?: string;
}

export function SignOutButton({
	className,
	variant = "ghost",
	redirectTo = "/",
}: SignOutButtonProps) {
	const [isPending, setIsPending] = useState(false);

	const handleSignOut = async () => {
		setIsPending(true);
		await authClient.signOut({
			fetchOptions: {
				onSuccess: () => {
					window.location.href = redirectTo;
				},
				onError: () => {
					console.error("Failed to sign out");
					setIsPending(false);
				},
			},
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
