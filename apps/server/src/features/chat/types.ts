import type { AppUIMessage } from "@/server/features/ai/types";

export interface Conversation {
	id: string;
	title: string | null;
	created: Date;
	updated: Date;
}

export interface MessageListResult {
	items: AppUIMessage[];
	nextCursor: number | null;
}
