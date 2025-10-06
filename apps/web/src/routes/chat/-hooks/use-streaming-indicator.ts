import { useMemo } from "react";
import type { ChatMessage } from "@/web/types/chat";

type UseStreamingIndicatorParams = {
	messages: ChatMessage[];
	status: string;
};

export function useStreamingIndicator({
	messages,
	status,
}: UseStreamingIndicatorParams): boolean {
	return useMemo(() => {
		if (status !== "streaming") {
			return false;
		}

		let latestAssistantMessage: ChatMessage | undefined;
		for (let index = messages.length - 1; index >= 0; index -= 1) {
			const candidate = messages[index];
			if (candidate?.role === "assistant") {
				latestAssistantMessage = candidate;
				break;
			}
		}

		if (!latestAssistantMessage) {
			return true;
		}

		const parts = Array.isArray(latestAssistantMessage.parts)
			? latestAssistantMessage.parts
			: [];

		for (const part of parts) {
			const partRecord = (part ?? {}) as Record<string, unknown>;
			const partType =
				typeof partRecord.type === "string" ? (partRecord.type as string) : "";

			if (partType.startsWith("reasoning")) {
				continue;
			}

			const delta =
				typeof partRecord.delta === "string"
					? (partRecord.delta as string).trim()
					: "";
			const text =
				typeof partRecord.text === "string"
					? (partRecord.text as string).trim()
					: "";
			const content = delta || text;

			if (content.length > 0) {
				return false;
			}

			if (partType && partType !== "text") {
				return false;
			}
		}

		return true;
	}, [messages, status]);
}
