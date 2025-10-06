import { Brain } from "lucide-react";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/web/components/ui/select";
import {
	useUpdateUserSettings,
	useUserSettings,
} from "@/web/hooks/use-user-settings";

interface ReasoningEffortSelectorProps {
	className?: string;
}

export function ReasoningEffortSelector({
	className,
}: ReasoningEffortSelectorProps) {
	const settingsQuery = useUserSettings();
	const updateSettings = useUpdateUserSettings();

	const currentEffort = settingsQuery.data?.reasoningEffort ?? "medium";

	const handleEffortChange = async (value: string) => {
		try {
			await updateSettings({
				reasoningEffort: value as "off" | "low" | "medium" | "high",
			});
		} catch (error) {
			console.error("Failed to update reasoning effort:", error);
		}
	};

	return (
		<div className={className}>
			<Select value={currentEffort} onValueChange={handleEffortChange}>
				<SelectTrigger className="h-9 w-auto min-w-[100px]">
					<div className="flex items-center gap-2">
						<Brain className="size-4 text-purple-600" />
						<SelectValue />
					</div>
				</SelectTrigger>
				<SelectContent>
					<SelectItem value="off">Off</SelectItem>
					<SelectItem value="low">Low</SelectItem>
					<SelectItem value="medium">Medium</SelectItem>
					<SelectItem value="high">High</SelectItem>
				</SelectContent>
			</Select>
		</div>
	);
}
