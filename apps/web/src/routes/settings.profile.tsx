import { Button } from "@better-agent/ui/components/button";
import { Input } from "@better-agent/ui/components/input";
import { Label } from "@better-agent/ui/components/label";
import { Separator } from "@better-agent/ui/components/separator";
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, getRouteApi, useNavigate } from "@tanstack/react-router";
import { LogOutIcon } from "lucide-react";
import { useState } from "react";
import type { FormEvent } from "react";
import { toast } from "sonner";

import { authClient } from "@/lib/auth-client";

const routeApi = getRouteApi("/settings/profile");

const getInitials = (name: string, email: string): string => {
	const source = name.trim() || email;
	return source
		.split(/\s+/u)
		.slice(0, 2)
		.map((part) => part.charAt(0).toUpperCase())
		.join("");
};

const RouteComponent = () => {
	const context = routeApi.useRouteContext();
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const profileQuery = useSuspenseQuery(context.orpc.profile.get.queryOptions());
	const [name, setName] = useState(profileQuery.data.name);
	const [isSigningOut, setIsSigningOut] = useState(false);

	const updateProfile = useMutation(
		context.orpc.profile.update.mutationOptions({
			onSuccess: async (profile) => {
				toast.success("Profile updated.");
				setName(profile.name);
				await queryClient.invalidateQueries({
					queryKey: context.orpc.profile.get.queryKey(),
				});
			},
		}),
	);

	const trimmedName = name.trim();
	const canSave = Boolean(trimmedName) && trimmedName !== profileQuery.data.name;
	const initials = getInitials(profileQuery.data.name, profileQuery.data.email);

	const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		if (!canSave || updateProfile.isPending) {
			return;
		}
		updateProfile.mutate({ name: trimmedName });
	};

	const handleSignOut = async () => {
		setIsSigningOut(true);
		await authClient.signOut({
			fetchOptions: {
				onError: () => {
					toast.error("Could not sign out. Try again.");
					setIsSigningOut(false);
				},
				onSuccess: () => {
					navigate({ to: "/login" });
				},
			},
		});
	};

	return (
		<div className="grid gap-8">
			<div className="grid gap-2">
				<h2 className="text-xl font-semibold tracking-tight">Account</h2>
				<p className="text-muted-foreground text-sm leading-relaxed">
					Your identity and session controls.
				</p>
			</div>

			<div className="flex flex-col gap-4 border border-border p-4 sm:flex-row sm:items-center sm:justify-between">
				<div className="flex items-center gap-3">
					<div className="flex size-10 items-center justify-center border border-border bg-muted text-sm font-medium">
						{initials}
					</div>
					<div className="grid gap-0.5">
						<p className="text-sm font-medium">{profileQuery.data.name}</p>
						<p className="text-muted-foreground text-sm">{profileQuery.data.email}</p>
					</div>
				</div>
				<Button
					disabled={isSigningOut}
					onClick={handleSignOut}
					size="sm"
					type="button"
					variant="outline"
				>
					<LogOutIcon className="mr-1.5 size-3.5" />
					{isSigningOut ? "Signing out…" : "Sign out"}
				</Button>
			</div>

			<Separator />

			<form className="grid max-w-md gap-4" onSubmit={handleSubmit}>
				<div className="grid gap-1.5">
					<Label htmlFor="settings-display-name">Display name</Label>
					<Input
						autoComplete="name"
						disabled={updateProfile.isPending}
						id="settings-display-name"
						onChange={(event) => setName(event.target.value)}
						value={name}
					/>
				</div>
				{updateProfile.error ? (
					<p className="text-destructive text-sm" role="alert">
						{updateProfile.error.message}
					</p>
				) : null}
				<Button className="w-fit" disabled={!canSave || updateProfile.isPending} type="submit">
					{updateProfile.isPending ? "Saving…" : "Save profile"}
				</Button>
			</form>
		</div>
	);
};

export const Route = createFileRoute("/settings/profile")({
	component: RouteComponent,
	loader: async ({ context }) =>
		await context.queryClient.ensureQueryData(context.orpc.profile.get.queryOptions()),
});
