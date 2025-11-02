import { useQuery } from "@tanstack/react-query";
import { Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { ArrowRight, Plus } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { RouterOutputs } from "@/server/lib/router";
import { Button } from "@/web/components/ui/button";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "@/web/components/ui/sheet";
import { useIsMobile } from "@/web/hooks/use-mobile";
import {
	useUpdateUserSettings,
	useUserSettings,
} from "@/web/hooks/use-user-settings";
import { QUICK_PROMPTS } from "@/web/lib/constants";
import { orpc } from "@/web/lib/orpc";
import { generateConversationId } from "@/web/utils/chat";
import { cn } from "@/web/utils/cn";
import { formatDistanceToNowStrict, getTimeOfDayLabel } from "@/web/utils/date";
import { MessageInput } from "./message-input";

export function ChatShell() {
	const navigate = useNavigate();
	const location = useRouterState({ select: (state) => state.location });
	const isMobile = useIsMobile();
	const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
	const [creatingConversation, setCreatingConversation] = useState(false);

	useEffect(() => {
		const handler = () => setMobileSidebarOpen(true);
		window.addEventListener(
			"better-chat:open-history",
			handler as EventListener,
		);
		return () =>
			window.removeEventListener(
				"better-chat:open-history",
				handler as EventListener,
			);
	}, []);

	const conversationsQuery = useQuery(
		orpc.chat.listConversations.queryOptions({
			staleTime: 30_000,
		}),
	);

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

	const selectedConversationId = useMemo(() => {
		const pathname = location.pathname ?? "";
		if (!pathname.startsWith("/chat")) {
			return null;
		}
		const [, base, maybeId] = pathname.split("/");
		if (base !== "chat" || !maybeId) {
			return null;
		}
		return decodeURIComponent(maybeId);
	}, [location.pathname]);

	useEffect(() => {
		if (selectedConversationId) {
			setCreatingConversation(false);
		}
	}, [selectedConversationId]);

	useEffect(() => {
		if (!isMobile) {
			setMobileSidebarOpen(false);
		}
	}, [isMobile]);

	const isConversationsLoading = conversationsQuery.isLoading;
	const conversations = conversationsQuery.data?.items ?? [];
	const hasActiveConversation = Boolean(selectedConversationId);

	const startNewConversation = () => {
		setCreatingConversation(false);
		setMobileSidebarOpen(false);
		void navigate({ to: "/chat" });
	};

	const handleSelectConversation = (conversationId: string) => {
		setMobileSidebarOpen(false);
		if (conversationId === selectedConversationId) {
			return;
		}
		void navigate({
			to: "/chat/$chatId",
			params: { chatId: conversationId },
		});
	};

	const handleStartNewChat = ({ text }: { text: string }) => {
		const safeText = (text || "").trim();
		if (!safeText || creatingConversation) {
			return;
		}
		setCreatingConversation(true);
		const newId = generateConversationId();
		if (typeof window !== "undefined") {
			try {
				sessionStorage.setItem(`better-chat:pending:${newId}`, safeText);
			} catch (_error) {}
		}
		void navigate({
			to: "/chat/$chatId",
			params: { chatId: newId },
		});
	};

	const getConversationList = (onSelect: (id: string) => void) => {
		if (isConversationsLoading) {
			return (
				<div className="flex justify-center pt-4">
					<p className="text-muted-foreground text-sm">Loading chats...</p>
				</div>
			);
		}

		if (conversations.length === 0) {
			return (
				<div className="flex justify-center pt-4">
					<p className="text-muted-foreground text-sm">No chats found.</p>
				</div>
			);
		}

		type Conversation =
			RouterOutputs["chat"]["listConversations"]["items"][number];

		return (
			<div className="space-y-2">
				{conversations.map((conversation: Conversation) => {
					const isActive = conversation.id === selectedConversationId;
					const title = conversation.title?.trim() || "Untitled chat";
					const relativeUpdated = formatDistanceToNowStrict(
						new Date(conversation.updated),
						{ addSuffix: true },
					);
					return (
						<Button
							key={conversation.id}
							variant={isActive ? "secondary" : "ghost"}
							className={cn(
								"group flex h-auto w-full flex-col items-start justify-start gap-1 whitespace-normal border text-left text-sm",
								isActive
									? "border-primary bg-primary/10 text-primary hover:bg-primary/10"
									: "border-transparent bg-muted/40 text-foreground hover:border-muted hover:bg-muted",
							)}
							onClick={() => onSelect(conversation.id)}
						>
							<span className="w-full truncate font-medium">{title}</span>
							<span className="text-muted-foreground text-xs">
								{relativeUpdated}
							</span>
						</Button>
					);
				})}
			</div>
		);
	};

	return (
		<div className="max-w-[100vw] overflow-x-hidden px-2 pt-13 sm:px-4">
			{isMobile && (
				<Sheet open={mobileSidebarOpen} onOpenChange={setMobileSidebarOpen}>
					<SheetContent
						side="left"
						className="w-[min(90vw,18rem)] border-r-0 p-0 sm:max-w-xs"
					>
						<SheetHeader className="sr-only">
							<SheetTitle>Chat History</SheetTitle>
							<SheetDescription>
								Navigate between your conversations.
							</SheetDescription>
						</SheetHeader>
						<div className="flex h-full flex-col gap-4 overflow-hidden bg-card p-4">
							<div className="space-y-3">
								<h2 className="font-semibold text-muted-foreground text-sm uppercase tracking-wide">
									Chat History
								</h2>
								<Button
									onClick={startNewConversation}
									size="sm"
									className="w-full gap-2"
								>
									<Plus className="size-4" /> New Chat
								</Button>
							</div>
							<div className="-mx-1 flex-1 overflow-y-auto px-1">
								{getConversationList(handleSelectConversation)}
							</div>
						</div>
					</SheetContent>
				</Sheet>
			)}
			<div
				className={cn(
					"mx-auto flex min-h-[calc(100svh-3.25rem-1.5rem)] w-full min-w-0 gap-2 px-1 sm:gap-4 sm:px-0 md:min-h-[calc(100svh-3.25rem-0.5rem)]",
					settingsQuery.data?.chatWidth === "comfortable"
						? "max-w-7xl"
						: "max-w-5xl",
				)}
			>
				<aside className="relative hidden w-64 shrink-0 md:block">
					<div className="sticky top-13 flex h-[calc(100svh-3.25rem-1.5rem)] flex-col overflow-hidden border bg-card p-3 shadow-sm sm:p-4 md:h-[calc(100svh-3.25rem-0.5rem)]">
						<div className="mb-4">
							<h2 className="font-semibold text-muted-foreground text-sm uppercase tracking-wide">
								Chat History
							</h2>
						</div>
						<Button
							onClick={startNewConversation}
							size="sm"
							className="mb-4 gap-2"
						>
							<Plus className="size-4" /> New Chat
						</Button>
						<div className="-mx-2 flex-1 overflow-y-auto px-2">
							{getConversationList(handleSelectConversation)}
						</div>
					</div>
				</aside>
				<section className="min-w-0 flex-1 basis-0">
					<div className="sticky top-13 flex h-[calc(100svh-3.25rem-1.5rem)] max-w-[100vw] flex-col overflow-hidden border bg-card shadow-sm md:h-[calc(100svh-3.25rem-0.5rem)]">
						{hasActiveConversation ? (
							<Outlet />
						) : (
							<div className="flex h-full flex-col overflow-hidden">
								<div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6">
									<div className="w-full space-y-5 text-sm sm:text-base">
										<div>
											<h2 className="mb-2 font-bold text-xl sm:text-3xl">
												How can I help you {getTimeOfDayLabel(new Date())}?
											</h2>
										</div>
										<div className="flex flex-col items-start space-y-3">
											{QUICK_PROMPTS.map((prompt) => (
												<Button
													key={prompt.id}
													variant="ghost"
													className="h-auto justify-start gap-2 p-2 text-primary text-sm hover:text-primary sm:text-base"
													onClick={() =>
														handleStartNewChat({ text: prompt.text })
													}
													disabled={creatingConversation}
												>
													<span>{prompt.label}</span>
													<ArrowRight className="size-3 sm:size-4" />
												</Button>
											))}
										</div>
									</div>
								</div>
								<div className="shrink-0 border-t bg-background/95 px-4 py-4 backdrop-blur supports-backdrop-filter:bg-background/60 sm:px-6">
									<div className="w-full">
										<MessageInput
											disabled={creatingConversation}
											modelId={selectedModelId}
											onModelChange={handleModelChange}
											onSendMessage={handleStartNewChat}
											userApiKeys={settingsQuery.data?.apiKeys}
											enabledModels={settingsQuery.data?.enabledModels}
										/>
									</div>
								</div>
							</div>
						)}
					</div>
				</section>
			</div>
		</div>
	);
}
