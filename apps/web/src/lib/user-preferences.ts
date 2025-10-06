export type ChatWidthPreference = "cozy" | "comfortable";

const CHAT_WIDTH_STORAGE_KEY = "better-chat:chat-width";

function isChatWidthPreference(
	value: string | null,
): value is ChatWidthPreference {
	return value === "cozy" || value === "comfortable";
}

export function getStoredChatWidth(): ChatWidthPreference | undefined {
	if (typeof window === "undefined") {
		return undefined;
	}

	const stored = window.localStorage.getItem(CHAT_WIDTH_STORAGE_KEY);
	return isChatWidthPreference(stored) ? stored : undefined;
}

export function setStoredChatWidth(width: ChatWidthPreference) {
	if (typeof window === "undefined") {
		return;
	}

	window.localStorage.setItem(CHAT_WIDTH_STORAGE_KEY, width);
}
