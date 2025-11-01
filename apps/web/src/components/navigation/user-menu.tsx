import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import {
	BookText,
	Github,
	Loader2,
	LogOutIcon,
	SettingsIcon,
	UserLock,
} from "lucide-react";
import { Button } from "@/web/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/web/components/ui/dropdown-menu";
import { authClient } from "@/web/lib/auth-client";
import { useAuth } from "@/web/lib/auth-context";
import { SITE_GITHUB } from "@/web/lib/constants";
import { orpc } from "@/web/lib/orpc";

const getFirstName = (
	user: { name?: string | null; email?: string | null } | null | undefined,
) => {
	if (!user) {
		return null;
	}
	return user.name?.trim().split(/\s+/)[0] ?? null;
};

export default function UserMenu() {
	const navigate = useNavigate();
	const auth = useAuth();

	const handleSignOut = async () => {
		await authClient.signOut({
			fetchOptions: {
				onSuccess: () => {
					window.location.href = "/";
				},
				onError: () => {
					console.error("Failed to sign out");
				},
			},
		});
	};

	const user = useQuery({
		...orpc.profile.getProfile.queryOptions(),
		enabled: Boolean(auth.session?.user),
		refetchOnWindowFocus: true,
		refetchOnMount: true,
		staleTime: 0,
	});

	const displayFirstName = user.data
		? (getFirstName(user.data) ?? "User")
		: null;

	// Show loading spinner while auth is pending
	if (auth.isPending) {
		return (
			<div className="flex h-8 w-8 items-center justify-center rounded-md">
				<Loader2 className="size-4 animate-spin" />
			</div>
		);
	}

	if (!auth.session?.user) {
		return (
			<Button
				variant="outline"
				onClick={() => navigate({ to: "/auth/sign-in" })}
			>
				Sign In
			</Button>
		);
	}

	const firstName = displayFirstName ?? "User";

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button variant="outline" size="sm" className="h-9 px-3">
					<span className="font-semibold text-sm">{firstName}</span>
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent className="w-56" align="end" forceMount>
				<DropdownMenuLabel className="font-normal">
					<div className="flex flex-col space-y-1">
						<p className="font-medium text-sm leading-none">
							{user.data?.name || "User"}
						</p>
						<p className="text-muted-foreground text-xs leading-none">
							{user.data?.email}
						</p>
					</div>
				</DropdownMenuLabel>
				<DropdownMenuSeparator />
				<DropdownMenuItem onClick={() => navigate({ to: "/settings" })}>
					<SettingsIcon className="size-4" />
					<span>Settings</span>
				</DropdownMenuItem>
				<DropdownMenuItem onClick={() => navigate({ to: "/docs" })}>
					<BookText className="size-4" />
					<span>Docs</span>
				</DropdownMenuItem>
				<DropdownMenuItem onClick={() => navigate({ to: "/privacy" })}>
					<UserLock className="size-4" />
					<span>Privacy Policy</span>
				</DropdownMenuItem>
				<DropdownMenuSeparator />
				<DropdownMenuItem onClick={() => window.open(SITE_GITHUB, "_blank")}>
					<Github className="size-4" />
					<span>Source</span>
				</DropdownMenuItem>
				<DropdownMenuSeparator />
				<DropdownMenuItem onClick={handleSignOut}>
					<LogOutIcon className="size-4" />
					<span>Sign Out</span>
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
