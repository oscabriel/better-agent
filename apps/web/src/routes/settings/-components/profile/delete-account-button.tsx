import { Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/web/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/web/components/ui/dialog";
import { authClient } from "@/web/lib/auth-client";

export function DeleteAccountButton() {
	const [isOpen, setIsOpen] = useState(false);
	const [isPending, setIsPending] = useState(false);
	const [emailSent, setEmailSent] = useState(false);

	const handleDeleteAccount = async () => {
		setIsPending(true);
		try {
			const { error } = await authClient.deleteUser();

			if (error) {
				console.error("Error requesting account deletion:", error);
				toast.error("Failed to request account deletion");
			} else {
				setEmailSent(true);
				toast.success("Confirmation email sent");
			}
		} catch (error) {
			console.error("Error requesting account deletion:", error);
			toast.error("Failed to request account deletion");
		} finally {
			setIsPending(false);
		}
	};

	const handleClose = () => {
		setIsOpen(false);
		setTimeout(() => {
			setEmailSent(false);
		}, 300);
	};

	return (
		<Dialog open={isOpen} onOpenChange={setIsOpen}>
			<DialogTrigger asChild>
				<Button
					variant="destructive"
					className="flex w-full items-center justify-center space-x-2 text-sm sm:w-auto"
				>
					<Trash2 className="h-4 w-4" />
					<span>Delete Account</span>
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>
						{emailSent ? "Confirmation Email Sent" : "Delete Account"}
					</DialogTitle>
					<DialogDescription>
						{emailSent
							? "We've sent a confirmation email to your registered email address. Please check your inbox and click the link in the email to complete the account deletion process."
							: "Are you sure you want to delete your account? This action cannot be undone and will permanently remove all your data."}
					</DialogDescription>
				</DialogHeader>
				<DialogFooter className="flex-col space-y-2 sm:flex-row sm:space-x-2 sm:space-y-0">
					{emailSent ? (
						<Button variant="outline" onClick={handleClose} className="w-full">
							Close
						</Button>
					) : (
						<>
							<Button
								variant="outline"
								onClick={handleClose}
								disabled={isPending}
								className="w-full sm:w-auto"
							>
								Cancel
							</Button>
							<Button
								variant="destructive"
								onClick={handleDeleteAccount}
								disabled={isPending}
								className="w-full sm:w-auto"
							>
								{isPending ? "Sending..." : "Delete Account"}
							</Button>
						</>
					)}
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
