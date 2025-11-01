import { createFileRoute } from "@tanstack/react-router";
import { useCallback } from "react";
import { toast } from "sonner";
import { ChatPageSkeleton } from "@/web/components/skeletons/chat-skeleton";
import { ChatComposer } from "./-components/chat-composer";
import { ChatError } from "./-components/chat-error";
import { ChatHeader } from "./-components/chat-header";
import { ChatMessagesList } from "./-components/chat-messages-list";
import { useChatOperations } from "./-hooks/use-chat-operations";
import { useChatScroll } from "./-hooks/use-chat-scroll";
import { useDeleteConversation } from "./-hooks/use-delete-conversation";
import { useModelSelection } from "./-hooks/use-model-selection";

export const Route = createFileRoute("/chat/$chatId")({
	component: ChatPage,
	pendingComponent: ChatPageSkeleton,
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

	const {
		selectedModelId,
		selectedModelIdRef,
		handleModelChange,
		settingsQuery,
	} = useModelSelection();

	const { scrollRef, contentRef, isAtBottom, scheduleScrollToBottom } =
		useChatScroll();

	const {
		messages,
		status,
		error,
		sendMessage,
		title,
		shouldShowStreamingIndicator,
	} = useChatOperations({
		chatId,
		selectedModelIdRef,
		scheduleScrollToBottom,
		onError: (message) => toast.error(message),
	});

	const { handleDelete, isDeleting } = useDeleteConversation();

	const handleSendMessage = useCallback(
		({ text }: { text: string }) => {
			scheduleScrollToBottom({ animation: "smooth", force: true });
			sendMessage({ text });
		},
		[scheduleScrollToBottom, sendMessage],
	);

	const handleDeleteConversation = useCallback(() => {
		void handleDelete(chatId);
	}, [handleDelete, chatId]);

	return (
		<div className="flex h-full flex-col overflow-hidden">
			<ChatHeader
				title={title}
				onDelete={handleDeleteConversation}
				isDeleting={isDeleting}
			/>
			<ChatMessagesList
				messages={messages}
				error={error ?? null}
				shouldShowStreamingIndicator={shouldShowStreamingIndicator}
				isAtBottom={isAtBottom}
				scrollRef={scrollRef as React.Ref<HTMLDivElement>}
				contentRef={contentRef as React.Ref<HTMLDivElement>}
				onScrollToBottom={() => {
					scheduleScrollToBottom({ animation: "smooth", force: true });
				}}
			/>
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
