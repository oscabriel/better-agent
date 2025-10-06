type SyncEvent =
	| { type: "usage-changed" }
	| { type: "conversation-changed"; chatId: string }
	| { type: "conversations-list-changed" };

let channel: BroadcastChannel | null = null;

export function initSyncChannel(): BroadcastChannel | null {
	if (typeof window === "undefined") return null;
	if (!("BroadcastChannel" in window)) {
		console.warn("BroadcastChannel not supported in this browser");
		return null;
	}

	if (!channel) {
		channel = new BroadcastChannel("better-chat-sync");
	}

	return channel;
}

export function broadcastSync(event: SyncEvent): void {
	if (!channel) {
		channel = initSyncChannel();
	}
	channel?.postMessage(event);
}

export function onSyncEvent(
	callback: (event: SyncEvent) => void,
): (() => void) | null {
	if (!channel) {
		channel = initSyncChannel();
	}

	if (!channel) return null;

	const handler = (event: MessageEvent<SyncEvent>) => {
		callback(event.data);
	};

	channel.addEventListener("message", handler);

	return () => {
		channel?.removeEventListener("message", handler);
	};
}

export function closeSyncChannel(): void {
	if (channel) {
		channel.close();
		channel = null;
	}
}
