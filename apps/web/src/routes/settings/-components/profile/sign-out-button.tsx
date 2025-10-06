import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/web/components/ui/button";
import { authClient } from "@/web/lib/auth-client";

export function SignOutButton() {
	const [isPending, setIsPending] = useState(false);

	const handleSignOut = async () => {
		setIsPending(true);
		await authClient.signOut({
			fetchOptions: {
				onSuccess: () => {
					toast.success("Signed out successfully");
					window.location.href = "/auth/sign-in";
				},
				onError: () => {
					toast.error("Failed to sign out");
					setIsPending(false);
				},
			},
		});
	};

	return (
		<Button
			variant="outline"
			onClick={handleSignOut}
			disabled={isPending}
			className="flex w-full items-center justify-center space-x-2 text-sm sm:w-auto"
		>
			{isPending ? "Signing out..." : "Sign Out"}
		</Button>
	);
}
