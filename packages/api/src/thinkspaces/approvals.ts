/**
 * The Approval holdpoint, expressed as pure transcript logic.
 *
 * A held tool (the Memory-proposing tool) is defined to the runtime with
 * Project Think's `needsApproval` mechanism. When the agent calls it, the
 * AI SDK does not execute it; it records a tool part in the `approval-requested`
 * state and parks the turn. Better Agent maps that transport-level pause onto a
 * product-level **Approval**: the owner decides, and the decision flips the part
 * to `approval-responded`, which resumes the parked turn — on approval the
 * tool's `execute` finally runs and writes the Memory; on rejection it never
 * runs and nothing persists (ADR-0006: Think's tool approval is the transport,
 * the product Approval is the authority).
 *
 * This module owns the seam in pure functions so it is testable without a live
 * model or the runtime: reading which holds a transcript is carrying, and
 * flipping one hold to its decided state. It imports neither `ai` nor
 * `@cloudflare/think`; it works on the structural shape of a UI message part.
 */

/** The runtime tool-part type the held Memory-proposing tool produces. */
export const MEMORY_WRITE_TOOL_PART_TYPE = "tool-memory_write" as const;

const APPROVAL_REQUESTED_STATE = "approval-requested";
const APPROVAL_RESPONDED_STATE = "approval-responded";
const OUTPUT_AVAILABLE_STATE = "output-available";
const OUTPUT_DENIED_STATE = "output-denied";

export const MEMORY_PROPOSAL_SUMMARY_MAX_LENGTH = 200;

export type ThinkspaceApprovalDecision = "approved" | "rejected";

/** A held Memory proposal awaiting the owner's decision. */
export interface PendingMemoryApproval {
	approvalRequestId: string;
	content: string;
	toolCallId: string;
}

/** A held Memory proposal the transcript already shows as decided. */
export interface ResolvedMemoryApproval {
	status: ThinkspaceApprovalDecision;
	toolCallId: string;
}

interface ApprovalShape {
	approved?: boolean;
	id?: unknown;
	reason?: unknown;
}

interface TranscriptToolPart {
	approval?: ApprovalShape;
	input?: unknown;
	state?: string;
	toolCallId?: unknown;
	type?: string;
}

interface TranscriptMessage {
	parts?: readonly TranscriptToolPart[];
	role?: string;
}

const isMemoryWritePart = (part: TranscriptToolPart): boolean =>
	part.type === MEMORY_WRITE_TOOL_PART_TYPE;

const toNonEmptyString = (value: unknown): string | null =>
	typeof value === "string" && value.length > 0 ? value : null;

const proposedContent = (input: unknown): string | null => {
	if (typeof input !== "object" || input === null) {
		return null;
	}

	const { content } = input as Record<string, unknown>;

	return toNonEmptyString(content);
};

/** A short product-language summary of a proposed Memory for the Review Queue. */
export const summarizeMemoryProposal = (content: string): string => {
	const collapsed = content.replaceAll(/\s+/gu, " ").trim();
	const bounded =
		collapsed.length > MEMORY_PROPOSAL_SUMMARY_MAX_LENGTH
			? `${collapsed.slice(0, MEMORY_PROPOSAL_SUMMARY_MAX_LENGTH - 1)}…`
			: collapsed;

	return `Proposed a durable Product Memory: "${bounded}"`;
};

/**
 * Every held Memory proposal a transcript is currently parked on. A part counts
 * as pending only when it is a Memory-write part in the `approval-requested`
 * state with the durable handles a decision needs (tool call id, approval
 * request id) and a non-empty proposed content; anything malformed is skipped
 * and stays held, never surfacing as a decidable Approval.
 */
export const extractPendingMemoryApprovals = (
	messages: readonly TranscriptMessage[],
): PendingMemoryApproval[] => {
	const pending: PendingMemoryApproval[] = [];

	for (const message of messages) {
		for (const part of message.parts ?? []) {
			if (!(isMemoryWritePart(part) && part.state === APPROVAL_REQUESTED_STATE)) {
				continue;
			}

			const toolCallId = toNonEmptyString(part.toolCallId);
			const approvalRequestId = toNonEmptyString(part.approval?.id);
			const content = proposedContent(part.input);

			if (!(toolCallId && approvalRequestId && content)) {
				continue;
			}

			pending.push({ approvalRequestId, content, toolCallId });
		}
	}

	return pending;
};

const resolvedStatus = (part: TranscriptToolPart): ThinkspaceApprovalDecision | null => {
	if (part.approval?.approved === true || part.state === OUTPUT_AVAILABLE_STATE) {
		return "approved";
	}

	if (part.approval?.approved === false || part.state === OUTPUT_DENIED_STATE) {
		return "rejected";
	}

	return null;
};

/**
 * Every held Memory proposal the transcript already shows as decided. Lets the
 * index reconcile rows the owner decided through another surface (a later
 * inline Sitting decision) back out of the Review Queue.
 */
export const extractResolvedMemoryApprovals = (
	messages: readonly TranscriptMessage[],
): ResolvedMemoryApproval[] => {
	const resolved: ResolvedMemoryApproval[] = [];

	for (const message of messages) {
		for (const part of message.parts ?? []) {
			if (!isMemoryWritePart(part) || part.state === APPROVAL_REQUESTED_STATE) {
				continue;
			}

			const toolCallId = toNonEmptyString(part.toolCallId);
			const status = resolvedStatus(part);

			if (toolCallId && status) {
				resolved.push({ status, toolCallId });
			}
		}
	}

	return resolved;
};

export interface FlipMemoryApprovalInput {
	decision: ThinkspaceApprovalDecision;
	messages: readonly TranscriptMessage[];
	reason?: string;
	toolCallId: string;
}

export interface FlipMemoryApprovalResult<TMessage> {
	flipped: boolean;
	messages: TMessage[];
}

/**
 * Records the owner's decision on one parked Memory proposal by flipping its
 * `approval-requested` part to `approval-responded`, preserving the part's
 * approval id (the AI SDK keys its continuation on it). Pure: it never mutates
 * the input, only flips the single part whose tool call id matches and that is
 * still awaiting a decision, and reports whether a flip happened so the caller
 * can fail closed when the hold is already gone.
 */
export const flipMemoryApprovalInTranscript = <TMessage extends TranscriptMessage>({
	decision,
	messages,
	reason,
	toolCallId,
}: {
	decision: ThinkspaceApprovalDecision;
	messages: readonly TMessage[];
	reason?: string;
	toolCallId: string;
}): FlipMemoryApprovalResult<TMessage> => {
	let flipped = false;

	const next = messages.map((message) => ({
		...message,
		parts: (message.parts ?? []).map((part) => {
			if (
				flipped ||
				!isMemoryWritePart(part) ||
				part.state !== APPROVAL_REQUESTED_STATE ||
				part.toolCallId !== toolCallId
			) {
				return part;
			}

			const approvalId = toNonEmptyString(part.approval?.id);

			if (!approvalId) {
				return part;
			}

			flipped = true;

			return {
				...part,
				approval: {
					approved: decision === "approved",
					id: approvalId,
					...(reason ? { reason } : {}),
				},
				state: APPROVAL_RESPONDED_STATE,
			};
		}),
	}));

	return { flipped, messages: next as TMessage[] };
};
