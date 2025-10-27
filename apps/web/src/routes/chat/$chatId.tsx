import { useChat } from "@ai-sdk/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { DefaultChatTransport } from "ai";
import { ChevronDown } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useStickToBottom } from "use-stick-to-bottom";
import { AppShellSkeleton } from "@/web/components/app-skeleton";
import { Button } from "@/web/components/ui/button";
import { Card } from "@/web/components/ui/card";
import {
	useUpdateUserSettings,
	useUserSettings,
} from "@/web/hooks/use-user-settings";
import { MAX_MESSAGE_BATCH } from "@/web/lib/constants";
import { orpc } from "@/web/lib/orpc";
import { ChatComposer } from "@/web/routes/chat/-components/chat-composer";
import { ChatError } from "@/web/routes/chat/-components/chat-error";
import { ChatHeader } from "@/web/routes/chat/-components/chat-header";
import { MessageRenderer } from "@/web/routes/chat/-components/message-renderer";
import { useInitializeChatMessages } from "@/web/routes/chat/-hooks/use-initialize-chat-messages";
import { usePendingConversationMessage } from "@/web/routes/chat/-hooks/use-pending-conversation-message";
import { useStreamingIndicator } from "@/web/routes/chat/-hooks/use-streaming-indicator";
import type { ChatMessage, ConversationSummary } from "@/web/types/chat";
import { broadcastSync } from "@/web/utils/sync";

export const Route = createFileRoute("/chat/$chatId")({
	component: ChatPage,
	pendingComponent: AppShellSkeleton,
	errorComponent: ChatError,
	loader: async ({ params, context }) => {
		const { chatId } = params;
		if (!chatId) return;

		// Check if this is a legitimate conversation
		const conversationsList = await context.queryClient.ensureQueryData(
			context.orpc.chat.listConversations.queryOptions(),
		);

		const conversationExists = conversationsList.items.some(
			(conv: { id: string }) => conv.id === chatId,
		);

		// Check if there's a pending message (new chat flow)
		const hasPendingMessage =
			typeof window !== "undefined" &&
			sessionStorage.getItem(`better-chat:pending:${chatId}`) !== null;

		// If conversation doesn't exist and no pending message, it's invalid
		if (!conversationExists && !hasPendingMessage) {
			throw new Error(
				"Conversation not found. This chat may have been deleted or the link is invalid.",
			);
		}

		// Load conversation data
		await Promise.all([
			context.queryClient.ensureQueryData(
				context.orpc.chat.listMessages.queryOptions({
					input: { conversationId: chatId },
				}),
			),
			context.queryClient.ensureQueryData(
				context.orpc.chat.getConversation.queryOptions({
					input: { conversationId: chatId },
				}),
			),
		]);
	},
});

function ChatPage() {
	const { chatId } = Route.useParams() as { chatId: string };
	const apiBase = `${import.meta.env.VITE_SERVER_URL}/api`;
	const queryClient = useQueryClient();
	const navigate = useNavigate();
	const [isDeleting, setIsDeleting] = useState(false);

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

	const { scrollRef, contentRef, isAtBottom, scrollToBottom } =
		useStickToBottom({
			initial: "instant",
			resize: "instant",
		});

	const scheduleScrollToBottom = useCallback(
		({
			animation = "instant",
			force = false,
		}: {
			animation?: "instant" | "smooth";
			force?: boolean;
		} = {}) => {
			if (!force && !isAtBottom) {
				return;
			}

			const performScroll = () => {
				void scrollToBottom({ animation });
			};

			if (typeof window === "undefined") {
				performScroll();
				return;
			}

			window.requestAnimationFrame(() => {
				window.requestAnimationFrame(performScroll);
			});
		},
		[isAtBottom, scrollToBottom],
	);

	const messagesQuery = useQuery(
		orpc.chat.listMessages.queryOptions({
			input: { conversationId: chatId },
			staleTime: 30_000,
			placeholderData: (previousData) => previousData,
		}),
	);

	const conversationQuery = useQuery(
		orpc.chat.getConversation.queryOptions({
			input: { conversationId: chatId },
			staleTime: 30_000,
		}),
	);

	const deleteConversationMutation = useMutation(
		orpc.chat.deleteConversation.mutationOptions({
			onSuccess: () => {
				queryClient.invalidateQueries({
					queryKey: orpc.chat.listConversations.key(),
				});
				toast.success("Conversation deleted");
				void navigate({ to: "/chat" });
			},
			onError: (error) => {
				toast.error(error.message);
			},
		}),
	);

	const { messages, status, error, sendMessage, setMessages } =
		useChat<ChatMessage>({
			id: chatId,
			transport: new DefaultChatTransport({
				api: `${apiBase}/ai`,
				credentials: "include",
				body: () => ({
					conversationId: chatId,
					messages: messages.slice(-MAX_MESSAGE_BATCH),
					modelId: selectedModelIdRef.current,
				}),
			}),
			onFinish: async () => {
				queryClient.invalidateQueries({
					queryKey: orpc.chat.listMessages.key({
						input: { conversationId: chatId },
					}),
				});
				queryClient.invalidateQueries({
					queryKey: orpc.chat.getConversation.key({
						input: { conversationId: chatId },
					}),
				});
				if (messages.length <= 2) {
					queryClient.invalidateQueries({
						queryKey: orpc.chat.listConversations.key(),
					});
					broadcastSync({ type: "conversations-list-changed" });
				}
				queryClient.invalidateQueries({
					queryKey: orpc.usage.getCurrentSummary.key(),
				});
				queryClient.invalidateQueries({
					queryKey: orpc.usage.getStats.key(),
				});

				broadcastSync({ type: "usage-changed" });
				broadcastSync({ type: "conversation-changed", chatId });
			},
		});

	useInitializeChatMessages({
		chatId,
		items: messagesQuery.data?.items,
		isLoading: messagesQuery.isLoading,
		setMessages,
		scheduleScrollToBottom,
	});

	const isMessagesReady =
		!messagesQuery.isLoading &&
		!messagesQuery.isFetching &&
		messagesQuery.isSuccess;

	usePendingConversationMessage({
		chatId,
		messages,
		sendMessage,
		status,
		isMessagesReady,
		onError: (message) => toast.error(message),
	});

	const title =
		(conversationQuery.data as ConversationSummary)?.title?.trim() ||
		"New chat";

	const shouldShowStreamingIndicator = useStreamingIndicator({
		messages,
		status,
	});

	const handleDeleteConversation = async () => {
		if (isDeleting) return;
		setIsDeleting(true);
		try {
			await deleteConversationMutation.mutateAsync({
				conversationId: chatId,
			});
		} finally {
			setIsDeleting(false);
		}
	};

	const handleSendMessage = useCallback(
		({ text }: { text: string }) => {
			scheduleScrollToBottom({ animation: "smooth", force: true });
			sendMessage({ text });
		},
		[scheduleScrollToBottom, sendMessage],
	);

	return (
		<div className="flex h-full flex-col overflow-hidden">
			<ChatHeader
				title={title}
				onDelete={handleDeleteConversation}
				isDeleting={isDeleting}
			/>
			<div
				className="relative flex-1 overflow-y-auto px-3 py-4 sm:px-6"
				ref={scrollRef}
			>
				<div ref={contentRef} className="w-full space-y-4 pb-10">
					{messages.map((message) => (
						<MessageRenderer key={message.id} message={message} />
					))}
					{shouldShowStreamingIndicator && (
						<div className="flex justify-start">
							<Card
								className="max-w-[80%] gap-2 py-2"
								role="status"
								aria-live="polite"
							>
								<div className="px-3 py-2">
									<span className="block animate-pulse text-muted-foreground text-xl leading-none">
										...
									</span>
									<span className="sr-only">
										Assistant is preparing a response
									</span>
								</div>
							</Card>
						</div>
					)}
					{error && (
						<div className="flex justify-center">
							<Card className="gap-2 border-destructive bg-destructive/10 py-2">
								<div className="px-3 py-2">
									<p className="text-destructive text-sm">
										{error.message || "An error occurred"}
									</p>
								</div>
							</Card>
						</div>
					)}
				</div>
				{!isAtBottom && (
					<div className="pointer-events-none sticky bottom-4 flex justify-center pr-2">
						<Button
							variant="secondary"
							size="icon"
							className="pointer-events-auto shadow"
							onClick={() => {
								scheduleScrollToBottom({ animation: "smooth", force: true });
							}}
							aria-label="Scroll to latest message"
						>
							<ChevronDown className="size-4" />
						</Button>
					</div>
				)}
			</div>
			<ChatComposer
				disabled={status === "streaming"}
				modelId={selectedModelId}
				onModelChange={handleModelChange}
				onSendMessage={handleSendMessage}
				userApiKeys={settingsQuery.data?.apiKeys}
				enabledModels={settingsQuery.data?.enabledModels}
			/>
		</div>
	);
}
