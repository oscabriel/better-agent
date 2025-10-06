import { useForm } from "@tanstack/react-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil } from "lucide-react";
import React, { useState } from "react";
import { toast } from "sonner";
import {
	Avatar,
	AvatarFallback,
	AvatarImage,
} from "@/web/components/ui/avatar";
import { Button } from "@/web/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/web/components/ui/dialog";
import { Input } from "@/web/components/ui/input";
import { Label } from "@/web/components/ui/label";
import { authClient } from "@/web/lib/auth-client";
import { orpc } from "@/web/lib/orpc";

export function ProfileInfo() {
	const [isEditOpen, setIsEditOpen] = useState(false);
	const queryClient = useQueryClient();
	const { data: session } = authClient.useSession();

	const user = useQuery({
		...orpc.profile.getProfile.queryOptions(),
		enabled: Boolean(session?.user),
		refetchOnWindowFocus: true,
		refetchOnMount: true,
		staleTime: 0,
	});

	const initials = useQuery({
		...orpc.profile.getInitials.queryOptions({
			input: {
				name: user.data?.name || null,
				email: user.data?.email || "",
			},
		}),
		enabled: !!user.data?.email,
	});

	const updateProfileMutation = useMutation(
		orpc.profile.updateProfile.mutationOptions({
			onSuccess: () => {
				toast.success("Profile updated successfully");
				setIsEditOpen(false);
				queryClient.invalidateQueries({
					queryKey: orpc.profile.getProfile.key(),
				});
				user.refetch();
				initials.refetch();
			},
			onError: (error) => {
				toast.error(error.message);
			},
		}),
	);

	const form = useForm({
		defaultValues: {
			name: "",
		},
		onSubmit: async ({ value }) => {
			if (!user.data) return;
			updateProfileMutation.mutate({
				name: value.name,
				image: user.data.image || undefined,
			});
		},
	});

	React.useEffect(() => {
		if (user.data && isEditOpen) {
			form.setFieldValue("name", user.data.name || "");
		}
	}, [user.data, isEditOpen]);

	React.useEffect(() => {
		if (!isEditOpen) {
			form.reset();
		}
	}, [isEditOpen]);

	if (user.isLoading) return <div>Loading...</div>;
	if (user.error) return <div>Error loading profile</div>;
	if (!user.data) return <div>No user data</div>;

	return (
		<div className="space-y-4">
			<div className="flex flex-col space-y-4 sm:flex-row sm:items-start sm:justify-between sm:space-y-0">
				<div className="space-y-3">
					<div className="flex items-center space-x-3 sm:space-x-4">
						<Avatar className="size-12 sm:size-16">
							<AvatarImage
								src={user.data.image || undefined}
								alt={user.data.name || "User avatar"}
							/>
							<AvatarFallback className="text-sm sm:text-lg">
								{initials.data || user.data.email?.charAt(0).toUpperCase()}
							</AvatarFallback>
						</Avatar>

						<div className="space-y-1">
							<h2 className="font-bold text-lg sm:text-xl">
								{user.data.name || "No name set"}
							</h2>
							<p className="text-muted-foreground text-xs sm:text-sm">
								{user.data.email}
							</p>
						</div>
					</div>
				</div>

				<div className="flex justify-center sm:justify-start">
					<Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
						<DialogTrigger asChild>
							<Button
								variant="outline"
								className="flex w-full items-center justify-center space-x-2 text-sm sm:w-auto"
							>
								<Pencil className="size-4" />
								<span>Edit Profile</span>
							</Button>
						</DialogTrigger>
						<DialogContent className="sm:max-w-md">
							<DialogHeader>
								<DialogTitle>Edit Profile</DialogTitle>
								<DialogDescription>
									Update your display name and profile information.
								</DialogDescription>
							</DialogHeader>
							<form
								onSubmit={(e) => {
									e.preventDefault();
									e.stopPropagation();
									form.handleSubmit();
								}}
								className="space-y-4"
							>
								<form.Field name="name">
									{(field) => (
										<div className="space-y-2">
											<Label htmlFor={field.name}>Display Name</Label>
											<Input
												id={field.name}
												name={field.name}
												type="text"
												value={field.state.value}
												onChange={(e) => field.handleChange(e.target.value)}
												onBlur={field.handleBlur}
												placeholder="Enter your display name"
												disabled={updateProfileMutation.isPending}
												autoComplete="name"
											/>
										</div>
									)}
								</form.Field>

								<div className="flex justify-end space-x-2">
									<Button
										variant="outline"
										onClick={() => setIsEditOpen(false)}
										disabled={updateProfileMutation.isPending}
									>
										Cancel
									</Button>
									<Button disabled={updateProfileMutation.isPending}>
										{updateProfileMutation.isPending
											? "Saving..."
											: "Save Changes"}
									</Button>
								</div>
							</form>
						</DialogContent>
					</Dialog>
				</div>
			</div>
		</div>
	);
}
