import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect } from "react";
import type { RouterInputs, RouterOutputs } from "@/server/lib/router";
import { authClient } from "@/web/lib/auth-client";
import { orpc } from "@/web/lib/orpc";
import {
	getStoredChatWidth,
	setStoredChatWidth,
} from "@/web/lib/user-preferences";

export type UserSettings = RouterOutputs["settings"]["get"];

const DEFAULT_USER_SETTINGS: UserSettings = {
	selectedModel: "google:gemini-2.5-flash-lite",
	apiKeys: {},
	enabledModels: [],
	enabledMcpServers: ["context7"],
	webSearchEnabled: false,
	reasoningEffort: "medium",
	theme: "system",
	chatWidth: "cozy",
};

/**
 * Shared hook for accessing user settings across the application.
 * This hook consolidates all user settings queries into a single query,
 * preventing excessive refetches and potential infinite loops.
 */
export function useUserSettings() {
	const { data: session } = authClient.useSession();
	const isAuthenticated = Boolean(session?.user?.id);

	const query = useQuery(
		orpc.settings.get.queryOptions({
			enabled: isAuthenticated,
			staleTime: 30_000,
			refetchOnMount: false,
			retry: false,
			placeholderData: () => {
				const storedChatWidth = getStoredChatWidth();
				if (!storedChatWidth) {
					return undefined;
				}
				return {
					...DEFAULT_USER_SETTINGS,
					chatWidth: storedChatWidth,
				};
			},
		}),
	);

	useEffect(() => {
		const chatWidth = query.data?.chatWidth;
		if (chatWidth === "cozy" || chatWidth === "comfortable") {
			setStoredChatWidth(chatWidth);
		}
	}, [query.data?.chatWidth]);

	return query;
}

/**
 * Hook to update user settings with optimistic updates
 */
export function useUpdateUserSettings() {
	const queryClient = useQueryClient();
	const { data: session } = authClient.useSession();
	const userId = session?.user?.id;

	const mutation = useMutation(
		orpc.settings.update.mutationOptions({
			onSuccess: (updated: UserSettings) => {
				queryClient.setQueryData(orpc.settings.get.queryKey({}), updated);
				if (
					updated.chatWidth === "cozy" ||
					updated.chatWidth === "comfortable"
				) {
					setStoredChatWidth(updated.chatWidth);
				}
			},
		}),
	);

	return useCallback(
		async (updates: Partial<UserSettings>) => {
			if (!userId) {
				throw new Error("User not authenticated");
			}
			return await mutation.mutateAsync(
				updates as RouterInputs["settings"]["update"],
			);
		},
		[mutation, userId],
	);
}
