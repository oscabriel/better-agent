import { useCallback, useEffect, useState } from "react";
import {
	useUpdateUserSettings,
	useUserSettings,
} from "@/web/hooks/use-user-settings";

export function useChatModelSelector() {
	const settingsQuery = useUserSettings();
	const updateSettings = useUpdateUserSettings();
	const [selectedModelId, setSelectedModelId] = useState<string | undefined>();

	useEffect(() => {
		const persisted = settingsQuery.data?.selectedModel;
		if (!persisted) {
			return;
		}

		setSelectedModelId((current) => current ?? persisted);
	}, [settingsQuery.data?.selectedModel]);

	const handleModelChange = useCallback(
		async (id: string) => {
			setSelectedModelId(id);
			try {
				await updateSettings({ selectedModel: id });
			} catch (_error) {}
		},
		[updateSettings],
	);

	return {
		selectedModelId,
		handleModelChange,
		settingsQuery,
	};
}
