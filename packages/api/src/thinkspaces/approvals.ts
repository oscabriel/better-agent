/**
 * The Approval holdpoint, expressed as pure transcript logic.
 *
 * A held tool (the Memory-proposing tool, the GitHub-issue-proposing tool) is
 * defined to the runtime with Project Think's `needsApproval` mechanism. When
 * the agent calls it, the AI SDK does not execute it; it records a tool part in
 * the `approval-requested` state and parks the turn. Better Agent maps that
 * transport-level pause onto a product-level **Approval**: the owner decides,
 * and the decision flips the part to `approval-responded`, which resumes the
 * parked turn — on approval the tool's `execute` finally runs and performs the
 * action; on rejection it never runs and nothing happens (ADR-0006: Think's
 * tool approval is the transport, the product Approval is the authority).
 *
 * This module owns the seam in pure functions so it is testable without a live
 * model or the runtime: reading which holds a transcript is carrying, and
 * flipping one hold to its decided state. The action-kind-specific bits — which
 * tool-part type a kind produces, how to pull its proposed payload out of the
 * part's input, and how to summarize it for the Review Queue — live in a small
 * per-action-kind **descriptor registry**; the generic skeletons read every
 * registered kind uniformly. It imports neither `ai` nor `@cloudflare/think`;
 * it works on the structural shape of a UI message part.
 */
import { THINKSPACE_APPROVAL_ACTION_KIND } from "@better-agent/db/schema/approvals";
import type { ThinkspaceApprovalActionKind } from "@better-agent/db/schema/approvals";

/** The runtime tool-part type the held Memory-proposing tool produces. */
export const MEMORY_WRITE_TOOL_PART_TYPE = "tool-memory_write" as const;

/** The runtime tool-part type the held GitHub-issue-proposing tool produces. */
export const CREATE_GITHUB_ISSUE_TOOL_PART_TYPE = "tool-create_github_issue" as const;

const APPROVAL_REQUESTED_STATE = "approval-requested";
const APPROVAL_RESPONDED_STATE = "approval-responded";
const OUTPUT_AVAILABLE_STATE = "output-available";
const OUTPUT_DENIED_STATE = "output-denied";

export const MEMORY_PROPOSAL_SUMMARY_MAX_LENGTH = 200;
export const GITHUB_ISSUE_SUMMARY_TITLE_MAX_LENGTH = 120;

export type ThinkspaceApprovalDecision = "approved" | "rejected";

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

const toNonEmptyString = (value: unknown): string | null =>
	typeof value === "string" && value.length > 0 ? value : null;

const collapseWhitespace = (value: string): string => value.replaceAll(/\s+/gu, " ").trim();

const bound = (value: string, maxLength: number): string =>
	value.length > maxLength ? `${value.slice(0, maxLength - 1)}…` : value;

/** A short product-language summary of a proposed Memory for the Review Queue. */
export const summarizeMemoryProposal = (content: string): string =>
	`Proposed a durable Product Memory: "${bound(
		collapseWhitespace(content),
		MEMORY_PROPOSAL_SUMMARY_MAX_LENGTH,
	)}"`;

const readMemoryContent = (input: unknown): string | null => {
	if (typeof input !== "object" || input === null) {
		return null;
	}

	const { content } = input as Record<string, unknown>;

	return toNonEmptyString(content);
};

/** A proposed GitHub issue, the payload the held `create_github_issue` tool carries. */
export interface ProposedGitHubIssue {
	body: string;
	repo: string;
	title: string;
}

/**
 * Pulls a proposed GitHub issue out of a held tool part's `input` (or any
 * object shaped like one), requiring a non-empty repo, title, and body;
 * anything malformed is null so the hold stays held and never surfaces a card
 * with nothing to decide.
 */
export const readProposedGitHubIssue = (input: unknown): ProposedGitHubIssue | null => {
	if (typeof input !== "object" || input === null) {
		return null;
	}

	const { body, repo, title } = input as Record<string, unknown>;
	const boundedBody = toNonEmptyString(body);
	const boundedRepo = toNonEmptyString(repo);
	const boundedTitle = toNonEmptyString(title);

	if (!(boundedBody && boundedRepo && boundedTitle)) {
		return null;
	}

	return { body: boundedBody, repo: boundedRepo, title: boundedTitle };
};

const serializeProposedGitHubIssue = (proposal: ProposedGitHubIssue): string =>
	JSON.stringify({ body: proposal.body, repo: proposal.repo, title: proposal.title });

/**
 * Parses a serialized `proposed_content` GitHub issue payload back into its
 * fields for the Review Queue. Null when the stored content is not a
 * well-formed issue payload, so a malformed row renders nothing rather than
 * throwing.
 */
export const parseProposedGitHubIssue = (proposedContent: string): ProposedGitHubIssue | null => {
	try {
		return readProposedGitHubIssue(JSON.parse(proposedContent) as unknown);
	} catch {
		return null;
	}
};

/** A short product-language summary of a proposed GitHub issue for the Review Queue. */
export const summarizeGitHubIssueProposal = ({
	repo,
	title,
}: Pick<ProposedGitHubIssue, "repo" | "title">): string =>
	`Create issue "${bound(
		collapseWhitespace(title),
		GITHUB_ISSUE_SUMMARY_TITLE_MAX_LENGTH,
	)}" in ${collapseWhitespace(repo)}`;

/**
 * One held action kind's transcript shape: which tool-part type it produces and
 * how to turn a parked part's `input` into the durable `proposed_content` (the
 * serialized payload) plus a human `proposed_summary`. `describeProposal`
 * returns null for a malformed input so the hold is skipped and never surfaces
 * as a decidable Approval.
 */
interface ApprovalActionDescriptor {
	actionKind: ThinkspaceApprovalActionKind;
	describeProposal: (input: unknown) => { proposedContent: string; proposedSummary: string } | null;
	partType: string;
}

const memoryWriteDescriptor: ApprovalActionDescriptor = {
	actionKind: THINKSPACE_APPROVAL_ACTION_KIND.MEMORY_WRITE,
	describeProposal: (input) => {
		const content = readMemoryContent(input);

		if (!content) {
			return null;
		}

		return { proposedContent: content, proposedSummary: summarizeMemoryProposal(content) };
	},
	partType: MEMORY_WRITE_TOOL_PART_TYPE,
};

const githubCreateIssueDescriptor: ApprovalActionDescriptor = {
	actionKind: THINKSPACE_APPROVAL_ACTION_KIND.GITHUB_CREATE_ISSUE,
	describeProposal: (input) => {
		const proposal = readProposedGitHubIssue(input);

		if (!proposal) {
			return null;
		}

		return {
			proposedContent: serializeProposedGitHubIssue(proposal),
			proposedSummary: summarizeGitHubIssueProposal(proposal),
		};
	},
	partType: CREATE_GITHUB_ISSUE_TOOL_PART_TYPE,
};

const APPROVAL_ACTION_DESCRIPTORS: readonly ApprovalActionDescriptor[] = [
	memoryWriteDescriptor,
	githubCreateIssueDescriptor,
];

const descriptorByPartType = new Map<string, ApprovalActionDescriptor>(
	APPROVAL_ACTION_DESCRIPTORS.map((descriptor) => [descriptor.partType, descriptor]),
);

const descriptorForPart = (part: TranscriptToolPart): ApprovalActionDescriptor | undefined =>
	typeof part.type === "string" ? descriptorByPartType.get(part.type) : undefined;

/** A held proposal awaiting the owner's decision, of any registered action kind. */
export interface PendingApproval {
	actionKind: ThinkspaceApprovalActionKind;
	approvalRequestId: string;
	proposedContent: string;
	proposedSummary: string;
	toolCallId: string;
}

/** A held proposal the transcript already shows as decided. */
export interface ResolvedApproval {
	status: ThinkspaceApprovalDecision;
	toolCallId: string;
}

/**
 * Every held proposal a transcript is currently parked on. A part counts as
 * pending only when it is a registered held-action part in the
 * `approval-requested` state with the durable handles a decision needs (tool
 * call id, approval request id) and a well-formed proposed payload; anything
 * malformed is skipped and stays held, never surfacing as a decidable Approval.
 */
export const extractPendingApprovals = (
	messages: readonly TranscriptMessage[],
): PendingApproval[] => {
	const pending: PendingApproval[] = [];

	for (const message of messages) {
		for (const part of message.parts ?? []) {
			if (part.state !== APPROVAL_REQUESTED_STATE) {
				continue;
			}

			const descriptor = descriptorForPart(part);

			if (!descriptor) {
				continue;
			}

			const toolCallId = toNonEmptyString(part.toolCallId);
			const approvalRequestId = toNonEmptyString(part.approval?.id);
			const proposal = descriptor.describeProposal(part.input);

			if (!(toolCallId && approvalRequestId && proposal)) {
				continue;
			}

			pending.push({
				actionKind: descriptor.actionKind,
				approvalRequestId,
				proposedContent: proposal.proposedContent,
				proposedSummary: proposal.proposedSummary,
				toolCallId,
			});
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
 * Every held proposal the transcript already shows as decided. Lets the index
 * reconcile rows the owner decided through another surface (a later inline
 * Sitting decision) back out of the Review Queue.
 */
export const extractResolvedApprovals = (
	messages: readonly TranscriptMessage[],
): ResolvedApproval[] => {
	const resolved: ResolvedApproval[] = [];

	for (const message of messages) {
		for (const part of message.parts ?? []) {
			if (!descriptorForPart(part) || part.state === APPROVAL_REQUESTED_STATE) {
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

export interface FlipApprovalResult<TMessage> {
	flipped: boolean;
	messages: TMessage[];
}

/**
 * Records the owner's decision on one parked proposal by flipping its
 * `approval-requested` part to `approval-responded`, preserving the part's
 * approval id (the AI SDK keys its continuation on it). Pure: it never mutates
 * the input, only flips the single registered held part whose tool call id
 * matches and that is still awaiting a decision, and reports whether a flip
 * happened so the caller can fail closed when the hold is already gone.
 */
export const flipApprovalInTranscript = <TMessage extends TranscriptMessage>({
	decision,
	messages,
	reason,
	toolCallId,
}: {
	decision: ThinkspaceApprovalDecision;
	messages: readonly TMessage[];
	reason?: string;
	toolCallId: string;
}): FlipApprovalResult<TMessage> => {
	let flipped = false;

	const next = messages.map((message) => ({
		...message,
		parts: (message.parts ?? []).map((part) => {
			if (
				flipped ||
				!descriptorForPart(part) ||
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
