import { useCallback, useEffect, useRef, useState } from "react";
import {
	useUpdateUserSettings,
	useUserSettings,
} from "@/web/hooks/use-user-settings";

/**
 * Hook to manage model selection with optimistic UI updates
 */
export function useModelSelection() {
	const settingsQuery = useUserSettings();
	const updateSettings = useUpdateUserSettings();

	// Local state for immediate UI updates, initialized from settings query
	const [localSelectedModelId, setLocalSelectedModelId] = useState<
		string | undefined
	>(settingsQuery.data?.selectedModel);

	// Sync local state when settings query data changes
	useEffect(() => {
		if (settingsQuery.data?.selectedModel) {
			setLocalSelectedModelId(settingsQuery.data.selectedModel);
		}
	}, [settingsQuery.data?.selectedModel]);

	const selectedModelId =
		localSelectedModelId || settingsQuery.data?.selectedModel;

	// Use ref to capture latest selectedModelId for useChat body function
	const selectedModelIdRef = useRef(selectedModelId);
	useEffect(() => {
		selectedModelIdRef.current = selectedModelId;
	}, [selectedModelId]);

	const handleModelChange = useCallback(
		async (id: string) => {
			// Update local state immediately for instant UI feedback
			setLocalSelectedModelId(id);
			try {
				// Persist to DB in background
				await updateSettings({ selectedModel: id });
			} catch (error) {
				// On error, revert local state
				setLocalSelectedModelId(settingsQuery.data?.selectedModel);
				console.error("Failed to update model:", error);
			}
		},
		[updateSettings, settingsQuery.data?.selectedModel],
	);

	return {
		selectedModelId,
		selectedModelIdRef,
		handleModelChange,
		settingsQuery,
	};
}
