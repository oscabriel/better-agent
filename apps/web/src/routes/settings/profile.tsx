import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent } from "@/web/components/ui/card";
import { Separator } from "@/web/components/ui/separator";
import { DeleteAccountButton } from "./-components/profile/delete-account-button";
import { ProfileInfo } from "./-components/profile/profile-info";
import { SessionManager } from "./-components/profile/session-manager";
import { SignOutButton } from "./-components/profile/sign-out-button";

export const Route = createFileRoute("/settings/profile")({
	component: ProfilePage,
});

function ProfilePage() {
	return (
		<Card>
			<CardContent className="space-y-6">
				<ProfileInfo />

				<Separator />

				<SessionManager />

				<Separator />

				<div className="flex flex-col space-y-3 sm:flex-row sm:justify-between sm:space-x-3 sm:space-y-0">
					<SignOutButton
						variant="outline"
						redirectTo="/auth/sign-in"
						className="flex w-full items-center justify-center space-x-2 text-sm sm:w-auto"
					/>
					<DeleteAccountButton />
				</div>
			</CardContent>
		</Card>
	);
}
