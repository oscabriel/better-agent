import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { ModeToggle } from "@/web/components/navigation/mode-toggle";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/web/components/ui/card";
import { useUserSettings } from "@/web/hooks/use-user-settings";
import { orpc } from "@/web/lib/orpc";
import { setStoredChatWidth } from "@/web/lib/user-preferences";

const chatWidthOptions = [
	{
		id: "cozy",
		label: "Cozy",
		description: "Focused, centered conversation layout",
	},
	{
		id: "comfortable",
		label: "Comfortable",
		description: "Full-width layout for spacious conversations",
	},
] as const;

export const Route = createFileRoute("/settings/appearance")({
	component: AppearanceSettings,
});

type ChatWidthOptionId = (typeof chatWidthOptions)[number]["id"];

function AppearanceSettings() {
	const queryClient = useQueryClient();
	const settingsQuery = useUserSettings();

	const updateChatWidthMutation = useMutation(
		orpc.settings.update.mutationOptions({
			onSuccess: () => {
				queryClient.invalidateQueries({
					queryKey: orpc.settings.get.key(),
				});
				toast.success("Chat width updated");
			},
			onError: (error) => {
				toast.error(error.message);
			},
		}),
	);

	const handleChatWidthChange = (width: ChatWidthOptionId) => {
		setStoredChatWidth(width);
		updateChatWidthMutation.mutate({ chatWidth: width });
	};

	const chatWidth = settingsQuery.data?.chatWidth || "cozy";

	return (
		<div className="space-y-6">
			<Card>
				<CardHeader className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
					<div>
						<CardTitle className="mb-1.5">Theme</CardTitle>
						<CardDescription>
							Toggle between light and dark mode.
						</CardDescription>
					</div>
					<ModeToggle />
				</CardHeader>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Chat Width</CardTitle>
					<CardDescription>
						Control how wide the main interface appears (sidebar width remains
						constant).
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-3">
					{chatWidthOptions.map((option) => {
						const isActive = chatWidth === option.id;
						return (
							<button
								key={option.id}
								type="button"
								className={`flex w-full cursor-pointer flex-col gap-2 p-4 text-left ${
									isActive
										? "border bg-background/60 hover:bg-background/80"
										: "hover:border hover:bg-muted/50"
								}`}
								onClick={() => handleChatWidthChange(option.id)}
								disabled={updateChatWidthMutation.isPending}
							>
								<span className="font-medium text-sm">{option.label}</span>
								<span className="text-muted-foreground text-xs">
									{option.description}
								</span>
							</button>
						);
					})}
				</CardContent>
			</Card>
		</div>
	);
}
