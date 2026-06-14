import { env } from "@better-agent/env/web";
import { Badge } from "@better-agent/ui/components/badge";
import { Button } from "@better-agent/ui/components/button";
import { Textarea } from "@better-agent/ui/components/textarea";
import { useAgentChat } from "@cloudflare/ai-chat/react";
import { useAgent } from "agents/react";
import type { FormEvent } from "react";
import { useState } from "react";

/**
 * Kebab-cased Durable Object class name. With `basePath` set, the client
 * connects to the worker's authenticated Sitting route directly and the worker
 * resolves the runtime by Thinkspace id, so this value only labels the
 * connection; it does not build the URL.
 */
const THINKSPACE_AGENT_RUNTIME = "thinkspace-agent";

interface SittingSectionProps {
	isArchived: boolean;
	isDraft: boolean;
	modelReady: boolean;
	thinkspaceId: string;
}

const getSittingBlockedMessage = ({
	isArchived,
	isDraft,
	modelReady,
}: {
	isArchived: boolean;
	isDraft: boolean;
	modelReady: boolean;
}): string | null => {
	if (isArchived) {
		return "Archived Thinkspaces cannot hold a Sitting.";
	}

	if (isDraft) {
		return "Activate this Thinkspace before opening a Sitting.";
	}

	if (!modelReady) {
		return "Model configuration must be ready before opening a Sitting.";
	}

	return null;
};

const getMessageRoleLabel = (role: string): string =>
	role === "user" ? "You" : "Thinkspace Agent";

const LiveSitting = ({ thinkspaceId }: { thinkspaceId: string }) => {
	const agent = useAgent({
		agent: THINKSPACE_AGENT_RUNTIME,
		basePath: `api/sittings/${thinkspaceId}`,
		host: env.VITE_SERVER_URL,
		name: thinkspaceId,
	});
	const { error, isRecovering, messages, sendMessage, status, stop } = useAgentChat({
		agent,
		credentials: "include",
	});
	const [draft, setDraft] = useState("");
	const isBusy = status === "submitted" || status === "streaming";

	const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		const text = draft.trim();

		if (!text || isBusy) {
			return;
		}

		setDraft("");
		void sendMessage({ text });
	};

	return (
		<div className="grid gap-4 border border-border p-4">
			<div
				aria-label="Sitting transcript"
				aria-live="polite"
				className="grid max-h-[28rem] gap-4 overflow-y-auto"
			>
				{messages.length === 0 ? (
					<p className="text-muted-foreground text-sm">
						No turns yet. Send a message to start working with this Thinkspace Agent over its full
						history.
					</p>
				) : (
					messages.map((message) => {
						const renderableParts = message.parts.filter(
							(part) => part.type === "text" || part.type === "reasoning",
						);

						// Skip turns with nothing to show: a turn that returned no text, or
						// the brief window before the first streamed token arrives. The
						// streaming/thinking badges below already signal an in-flight turn.
						if (renderableParts.length === 0) {
							return null;
						}

						return (
							<div className="grid gap-1" key={message.id}>
								<p className="text-muted-foreground text-xs font-medium">
									{getMessageRoleLabel(message.role)}
								</p>
								{renderableParts.map((part, index) => {
									if (part.type === "reasoning") {
										return (
											<p
												className="whitespace-pre-wrap border-border border-l-2 pl-3 text-muted-foreground text-xs italic leading-relaxed"
												key={`${message.id}-reasoning-${index}`}
											>
												{part.text}
											</p>
										);
									}

									return (
										<p
											className="whitespace-pre-wrap text-sm leading-relaxed"
											key={`${message.id}-text-${index}`}
										>
											{part.type === "text" ? part.text : ""}
										</p>
									);
								})}
							</div>
						);
					})
				)}
			</div>
			<div className="flex flex-wrap items-center gap-3 border-border border-t pt-3">
				{isRecovering ? <Badge variant="secondary">Recovering the agent&apos;s turn…</Badge> : null}
				{status === "streaming" ? <Badge variant="secondary">Streaming…</Badge> : null}
				{status === "submitted" ? <Badge variant="secondary">Thinking…</Badge> : null}
			</div>
			{error ? (
				<p className="text-destructive text-xs" role="alert">
					{error.message}
				</p>
			) : null}
			<form className="grid gap-2" onSubmit={handleSubmit}>
				<label className="sr-only" htmlFor="sitting-message">
					Message to the Thinkspace Agent
				</label>
				<Textarea
					id="sitting-message"
					onChange={(event) => setDraft(event.target.value)}
					onKeyDown={(event) => {
						if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
							event.currentTarget.form?.requestSubmit();
						}
					}}
					placeholder="Push back, ask the agent to defend a conclusion, or redirect it."
					rows={3}
					value={draft}
				/>
				<div className="flex items-center justify-end gap-2">
					{isBusy ? (
						<Button onClick={() => void stop()} type="button" variant="outline">
							Stop
						</Button>
					) : null}
					<Button disabled={!draft.trim() || isBusy} type="submit">
						Send
					</Button>
				</div>
			</form>
		</div>
	);
};

export const SittingSection = ({
	isArchived,
	isDraft,
	modelReady,
	thinkspaceId,
}: SittingSectionProps) => {
	const blockedMessage = getSittingBlockedMessage({ isArchived, isDraft, modelReady });

	return (
		<section aria-labelledby="sitting-heading" className="grid gap-4">
			<div className="grid gap-1">
				<h2 className="text-lg font-semibold tracking-tight" id="sitting-heading">
					Sitting
				</h2>
				<p className="text-muted-foreground text-sm">
					Work live with this Thinkspace Agent over its full durable history. Responses stream, and
					an in-flight turn survives a refresh and resumes where it left off.
				</p>
			</div>
			{blockedMessage ? (
				<p className="border border-border p-4 text-muted-foreground text-sm">{blockedMessage}</p>
			) : (
				<LiveSitting thinkspaceId={thinkspaceId} />
			)}
		</section>
	);
};
