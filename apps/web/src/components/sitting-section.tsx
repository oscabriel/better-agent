import { MEMORY_WRITE_TOOL_PART_TYPE } from "@better-agent/api/thinkspaces/approvals";
import { env } from "@better-agent/env/web";
import { Badge } from "@better-agent/ui/components/badge";
import { Button } from "@better-agent/ui/components/button";
import { Textarea } from "@better-agent/ui/components/textarea";
import {
	getToolApproval,
	getToolInput,
	getToolPartState,
	useAgentChat,
} from "@cloudflare/ai-chat/react";
import { useAgent } from "agents/react";
import { CheckIcon, XIcon } from "lucide-react";
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

type ProposalDecisionView = "approved" | "pending" | "rejected";

const PROPOSAL_BADGE: Record<
	ProposalDecisionView,
	{ label: string; variant: "default" | "outline" | "secondary" }
> = {
	approved: { label: "Approved", variant: "default" },
	pending: { label: "Awaiting your decision", variant: "secondary" },
	rejected: { label: "Rejected", variant: "outline" },
};

const readProposedMemory = (input: unknown): string | null => {
	if (typeof input !== "object" || input === null) {
		return null;
	}

	const { content } = input as { content?: unknown };

	return typeof content === "string" && content.length > 0 ? content : null;
};

/**
 * Maps the live tool-part state onto the product decision the transcript shows.
 * A held proposal is `pending` only while genuinely awaiting the owner; once
 * decided it reads as `approved` (responded, executed, or failed mid-execution)
 * or `rejected`. A failed write still reads as approved because the owner did
 * approve it — the agent narrates the failure in the turn — and keeping the card
 * means an approved proposal never silently vanishes. Transient states before
 * the hold is raised return null so a half-formed proposal never renders a
 * decidable card.
 */
const toProposalDecisionView = (state: string): ProposalDecisionView | null => {
	switch (state) {
		case "waiting-approval": {
			return "pending";
		}
		case "approved":
		case "complete":
		case "error": {
			return "approved";
		}
		case "denied": {
			return "rejected";
		}
		default: {
			return null;
		}
	}
};

const HeldMemoryProposal = ({
	approvalId,
	content,
	decision,
	disabled,
	onDecide,
}: {
	approvalId: string;
	content: string;
	decision: ProposalDecisionView;
	disabled: boolean;
	onDecide: (approvalId: string, approved: boolean) => void;
}) => {
	const badge = PROPOSAL_BADGE[decision];

	return (
		<div className="grid gap-3 rounded-lg border border-border bg-card p-4">
			<div className="flex items-start justify-between gap-3">
				<p className="text-sm font-medium">Memory proposal</p>
				<Badge variant={badge.variant}>{badge.label}</Badge>
			</div>
			<p className="whitespace-pre-wrap text-foreground text-sm leading-relaxed">{content}</p>
			{decision === "pending" ? (
				<div className="flex flex-wrap items-center justify-between gap-3">
					<p className="text-muted-foreground text-xs">
						Held until you decide — approve to write this Memory, reject to discard it.
					</p>
					<div className="flex gap-2">
						<Button
							disabled={disabled}
							onClick={() => onDecide(approvalId, false)}
							size="sm"
							variant="outline"
						>
							<XIcon />
							Reject
						</Button>
						<Button disabled={disabled} onClick={() => onDecide(approvalId, true)} size="sm">
							<CheckIcon />
							Approve
						</Button>
					</div>
				</div>
			) : (
				<p className="text-muted-foreground text-xs">
					{decision === "approved" ? "You approved this proposal." : "You rejected this proposal."}
				</p>
			)}
		</div>
	);
};

const LiveSitting = ({ thinkspaceId }: { thinkspaceId: string }) => {
	const agent = useAgent({
		agent: THINKSPACE_AGENT_RUNTIME,
		basePath: `api/sittings/${thinkspaceId}`,
		host: env.VITE_SERVER_URL,
		name: thinkspaceId,
	});
	const { addToolApprovalResponse, error, isRecovering, messages, sendMessage, status, stop } =
		useAgentChat({
			agent,
			credentials: "include",
		});
	const [draft, setDraft] = useState("");
	const isBusy = status === "submitted" || status === "streaming";

	// One Approval, two surfaces: deciding inline drives the agents-stack native
	// tool-approval response (the same hold the Review Queue's control-plane decide
	// resolves), which flips the held part and resumes the parked turn over the
	// live transcript. Multiple Sitting tabs stay consistent through the shared
	// Durable Object transcript broadcast.
	const handleDecideProposal = (approvalId: string, approved: boolean) => {
		addToolApprovalResponse({ approved, id: approvalId });
	};

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
						const renderableParts = message.parts.filter((part) => {
							if (part.type === "text" || part.type === "reasoning") {
								return true;
							}

							// A held Memory proposal is renderable once it carries a decidable
							// state and content; a half-formed or malformed hold is skipped so it
							// never surfaces a card with nothing to decide.
							return (
								part.type === MEMORY_WRITE_TOOL_PART_TYPE &&
								toProposalDecisionView(getToolPartState(part)) !== null &&
								readProposedMemory(getToolInput(part)) !== null
							);
						});

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

									if (part.type === MEMORY_WRITE_TOOL_PART_TYPE) {
										const approval = getToolApproval(part);
										const content = readProposedMemory(getToolInput(part));
										const decision = toProposalDecisionView(getToolPartState(part));

										if (!(approval && content && decision)) {
											return null;
										}

										return (
											<HeldMemoryProposal
												approvalId={approval.id}
												content={content}
												decision={decision}
												disabled={isBusy}
												key={`${message.id}-proposal-${index}`}
												onDecide={handleDecideProposal}
											/>
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
