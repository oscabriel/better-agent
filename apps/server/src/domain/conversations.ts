import type { AppUIMessage } from "@/server/domain/ui-messages";

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
