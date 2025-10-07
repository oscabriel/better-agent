import { Globe } from "lucide-react";
import { memo } from "react";
import { toast } from "sonner";
import { Button } from "@/web/components/ui/button";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/web/components/ui/tooltip";
import {
	useUpdateUserSettings,
	useUserSettings,
} from "@/web/hooks/use-user-settings";

interface WebSearchDialogButtonProps {
	disabled?: boolean;
}

export const WebSearchDialogButton = memo(
	({ disabled }: WebSearchDialogButtonProps) => {
		const { data: userSettings } = useUserSettings();
		const updateSettings = useUpdateUserSettings();

		const handleWebSearchToggle = async () => {
			if (!userSettings?.apiKeys?.exa) {
				return;
			}
			const newState = !userSettings.webSearchEnabled;
			try {
				await updateSettings({ webSearchEnabled: newState });
				toast.success(newState ? "Web search enabled" : "Web search disabled");
			} catch (err) {
				toast.error(`Failed to update web search setting: ${err}`);
			}
		};

		const hasExaKey = Boolean(userSettings?.apiKeys?.exa);
		const webSearchEnabled = userSettings?.webSearchEnabled ?? false;

		return (
			<TooltipProvider>
				<Tooltip>
					<TooltipTrigger asChild>
						<span className="inline-flex">
							<Button
								type="button"
								variant={webSearchEnabled && hasExaKey ? "default" : "outline"}
								size="icon"
								onClick={handleWebSearchToggle}
								disabled={!hasExaKey || disabled}
							>
								<Globe className="size-4" />
							</Button>
						</span>
					</TooltipTrigger>
					<TooltipContent>
						{!hasExaKey ? (
							<p>Configure Exa API key in settings</p>
						) : (
							<p>Web search {webSearchEnabled ? "enabled" : "disabled"}</p>
						)}
					</TooltipContent>
				</Tooltip>
			</TooltipProvider>
		);
	},
);

WebSearchDialogButton.displayName = "WebSearchDialogButton";
