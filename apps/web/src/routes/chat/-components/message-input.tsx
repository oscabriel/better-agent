import { useQuery } from "@tanstack/react-query";
import { Send } from "lucide-react";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/web/components/ui/button";
import { Textarea } from "@/web/components/ui/textarea";
import { useIsMobile } from "@/web/hooks/use-mobile";
import { orpc } from "@/web/lib/orpc";
import { ChatSettingsDialog } from "./chat-settings-dialog";
import { ModelSelector } from "./model-selector";
import { ReasoningEffortSelector } from "./reasoning-effort-selector";
import { ToolsDialogButton } from "./tools-dialog-button";
import { WebSearchDialogButton } from "./web-search-dialog-button";

interface MessageInputProps {
	disabled?: boolean;
	onSendMessage: (message: { text: string; modelId?: string }) => void;
	modelId?: string;
	onModelChange?: (modelId: string) => void;
	userApiKeys?: Record<string, string>;
	enabledModels?: string[];
}

export const MessageInput = memo(
	({
		disabled,
		onSendMessage,
		modelId,
		onModelChange,
		userApiKeys,
		enabledModels,
	}: MessageInputProps) => {
		const [input, setInput] = useState("");
		const textareaRef = useRef<HTMLTextAreaElement>(null);
		const isMobile = useIsMobile();

		const modelsQuery = useQuery(
			orpc.models.list.queryOptions({
				staleTime: 60_000,
			}),
		);

		const selectedModel = modelsQuery.data?.find((m) => m.id === modelId);
		const hasReasoningCapability =
			selectedModel?.capabilities?.includes("reasoning") ?? false;

		const adjustHeight = useCallback((element: HTMLTextAreaElement | null) => {
			if (!element) return;
			const MIN_HEIGHT = 36;
			element.style.height = "auto";
			const nextHeight = Math.max(element.scrollHeight, MIN_HEIGHT);
			element.style.height = `${nextHeight}px`;
		}, []);

		useEffect(() => {
			adjustHeight(textareaRef.current);
		}, [input, adjustHeight]);

		const handleSend = () => {
			if (!input.trim() || disabled) return;
			onSendMessage({ text: input.trim(), modelId });
			setInput("");
			adjustHeight(textareaRef.current);
		};

		const handleKeyPress = (e: React.KeyboardEvent) => {
			if (e.key === "Enter" && !e.shiftKey) {
				e.preventDefault();
				handleSend();
			}
		};

		return (
			<form
				onSubmit={(e) => {
					e.preventDefault();
					handleSend();
				}}
				className="flex flex-col gap-2 px-0 sm:px-0"
			>
				<div className="flex items-end gap-2">
					<Textarea
						ref={textareaRef}
						placeholder="Type your message..."
						value={input}
						onChange={(e) => {
							setInput(e.target.value);
							adjustHeight(e.currentTarget);
						}}
						onKeyDown={handleKeyPress}
						disabled={disabled}
						className="h-9 min-h-0 flex-1 resize-none overflow-hidden px-3 py-1.5"
						rows={1}
						autoComplete="off"
						autoFocus
					/>
					<Button
						disabled={!input.trim() || disabled}
						size="icon"
						className="shrink-0"
						type="submit"
					>
						<Send className="size-4" />
					</Button>
				</div>
				<div className="flex items-center gap-2">
					{isMobile ? (
						<>
							<div className="flex-1 truncate text-muted-foreground text-sm">
								{selectedModel?.name || "Select model"}
							</div>
							<ChatSettingsDialog
								disabled={disabled}
								modelId={modelId}
								onModelChange={onModelChange}
							/>
						</>
					) : (
						<>
							<ModelSelector
								modelId={modelId || "google:gemini-2.5-flash-lite"}
								onModelChange={onModelChange}
								userApiKeys={userApiKeys}
								enabledModels={enabledModels}
							/>
							{hasReasoningCapability && <ReasoningEffortSelector />}
							<ToolsDialogButton disabled={disabled} />
							<WebSearchDialogButton disabled={disabled} />
						</>
					)}
				</div>
			</form>
		);
	},
);

MessageInput.displayName = "MessageInput";
