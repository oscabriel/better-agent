import { useCallback, useEffect, useState } from "react";
import {
	useUpdateUserSettings,
	useUserSettings,
} from "@/web/hooks/use-user-settings";

export function useChatModelSelector() {
	const settingsQuery = useUserSettings();
	const updateSettings = useUpdateUserSettings();
	const [selectedModelId, setSelectedModelId] = useState<string | undefined>();

	// Sync local state with persisted settings
	useEffect(() => {
		if (settingsQuery.data?.selectedModel) {
			setSelectedModelId(settingsQuery.data.selectedModel);
		}
	}, [settingsQuery.data?.selectedModel]);

	const handleModelChange = useCallback(
		async (id: string) => {
			setSelectedModelId(id);
			try {
				await updateSettings({ selectedModel: id });
			} catch (_error) {
				// Revert on error
				if (settingsQuery.data?.selectedModel) {
					setSelectedModelId(settingsQuery.data.selectedModel);
				}
			}
		},
		[updateSettings, settingsQuery.data?.selectedModel],
	);

	return {
		selectedModelId,
		handleModelChange,
		settingsQuery,
	};
}
