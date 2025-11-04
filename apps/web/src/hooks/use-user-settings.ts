import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect } from "react";
import type { RouterInputs, RouterOutputs } from "@/server/lib/router";
import { useAuth } from "@/web/components/auth-provider";
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
 *
 * Caching Strategy:
 * - 5 minute staleTime (matches server cookie cache duration)
 * - No automatic refetching (refetchOnMount disabled)
 * - Optimistic updates on mutations for instant UI feedback
 *
 * This consolidates all user settings queries into a single query,
 * preventing excessive refetches and reducing server load.
 */
export function useUserSettings() {
	const auth = useAuth();
	const isAuthenticated = Boolean(auth.session?.user?.id);

	const query = useQuery(
		orpc.settings.get.queryOptions({
			enabled: isAuthenticated,
			staleTime: 5 * 60 * 1000, // 5 minutes
			refetchOnMount: false,
			refetchOnWindowFocus: false,
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
	const auth = useAuth();
	const userId = auth.session?.user?.id;

	const mutation = useMutation(
		orpc.settings.update.mutationOptions({
			onMutate: async (updates: RouterInputs["settings"]["update"]) => {
				// Cancel outgoing refetches to prevent race conditions
				await queryClient.cancelQueries({
					queryKey: orpc.settings.get.queryKey({}),
				});

				// Snapshot previous value for rollback
				const previous = queryClient.getQueryData(
					orpc.settings.get.queryKey({}),
				);

				// Optimistically update cache immediately
				if (previous) {
					queryClient.setQueryData(orpc.settings.get.queryKey({}), {
						...previous,
						...updates,
					});
				}

				return { previous };
			},
			onSuccess: (updated: UserSettings) => {
				// Update with server response
				queryClient.setQueryData(orpc.settings.get.queryKey({}), updated);
				if (
					updated.chatWidth === "cozy" ||
					updated.chatWidth === "comfortable"
				) {
					setStoredChatWidth(updated.chatWidth);
				}
			},
			onError: (_error, _variables, context) => {
				// Rollback optimistic update on error
				if (context?.previous) {
					queryClient.setQueryData(
						orpc.settings.get.queryKey({}),
						context.previous,
					);
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
