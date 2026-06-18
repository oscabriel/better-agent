import assert from "node:assert/strict";
import test from "node:test";

import type { ProductDb } from "@better-agent/db";
import { user } from "@better-agent/db/schema/auth";
import { thinkspaces } from "@better-agent/db/schema/thinkspaces";

import { createTestProductDb } from "../testing/product-db";
import {
	extractResolvedMemoryApprovals,
	flipMemoryApprovalInTranscript,
	MEMORY_WRITE_TOOL_PART_TYPE,
} from "./approvals";
import type { ThinkspaceApprovalDecision } from "./approvals";
import {
	listPendingThinkspaceApprovals,
	resolveThinkspaceApproval,
	upsertPendingThinkspaceApproval,
} from "./approvals-repository";

/**
 * One Approval, two surfaces. A held Memory proposal can be decided inline in a
 * live Sitting or from the cross-Thinkspace Review Queue, and both must resolve
 * the *same* product Approval through the *same* index resolve. These tests pin
 * that convergence so the two surfaces can never drift into two mechanisms.
 *
 * - The Review Queue (control plane) flips the held part in place with
 *   `flipMemoryApprovalInTranscript` and resolves the index row directly — what
 *   the runtime's `decideMemoryApproval` does.
 * - An inline Sitting decision drives the agents/ai-chat native tool-approval
 *   transition over the live transcript, and the runtime's `onChatResponse`
 *   reconciliation reads the decided part back out (`extractResolvedMemoryApprovals`)
 *   and resolves the same index row.
 */

const OWNER_ID = "owner_user";
const THINKSPACE_ID = "thinkspace_surfaces";
const TOOL_CALL_ID = "tool_call_1";
const APPROVAL_ID = "approval_1";
const APPROVAL_REQUEST_ID = "approval_req_1";
const PROPOSED_CONTENT = "The user prefers Vendor A.";

const DECISIONS: ThinkspaceApprovalDecision[] = ["approved", "rejected"];

const seed = async (db: ProductDb) => {
	await db.insert(user).values({ email: "owner@example.com", id: OWNER_ID, name: "Owner" });
	await db.insert(thinkspaces).values({
		goal: "Decide vendors",
		id: THINKSPACE_ID,
		ownerUserId: OWNER_ID,
		status: "active",
	});
	await upsertPendingThinkspaceApproval(db, {
		record: {
			actionKind: "memory_write",
			approvalRequestId: APPROVAL_REQUEST_ID,
			id: APPROVAL_ID,
			ownerUserId: OWNER_ID,
			profileRevisionId: null,
			profileVersion: null,
			proposedContent: PROPOSED_CONTENT,
			proposedSummary: `Proposed a durable Product Memory: "${PROPOSED_CONTENT}"`,
			submissionId: null,
			thinkspaceId: THINKSPACE_ID,
			toolCallId: TOOL_CALL_ID,
		},
	});
};

const parkedTranscript = () => [
	{
		parts: [
			{
				approval: { id: APPROVAL_REQUEST_ID },
				input: { content: PROPOSED_CONTENT },
				state: "approval-requested",
				toolCallId: TOOL_CALL_ID,
				type: MEMORY_WRITE_TOOL_PART_TYPE,
			},
		],
		role: "assistant",
	},
];

/**
 * The agents/ai-chat server transition an inline Sitting decision drives
 * (`_applyToolApproval`): an inline approve flips the held part to
 * `approval-responded`, an inline reject to `output-denied`, both stamping
 * `approval.approved`. Mirrored here so the test exercises the real inline part
 * shape without a live WebSocket. Verified against `@cloudflare/ai-chat` dist.
 */
const applyInlineNativeDecision = (
	messages: ReturnType<typeof parkedTranscript>,
	approved: boolean,
) =>
	messages.map((message) => ({
		...message,
		parts: message.parts.map((part) =>
			part.type === MEMORY_WRITE_TOOL_PART_TYPE
				? {
						...part,
						approval: { ...part.approval, approved },
						state: approved ? "approval-responded" : "output-denied",
					}
				: part,
		),
	}));

test("an inline Sitting decision reconciles to the same outcome the control-plane decide records", () => {
	for (const decision of DECISIONS) {
		const approved = decision === "approved";

		// The Review Queue flips the held part in place.
		const controlPlane = flipMemoryApprovalInTranscript({
			decision,
			messages: parkedTranscript(),
			toolCallId: TOOL_CALL_ID,
		});
		assert.equal(controlPlane.flipped, true);

		// An inline decision drives the native transition over the live transcript.
		const inline = applyInlineNativeDecision(parkedTranscript(), approved);

		// The runtime's index reconciliation reads both surfaces to the identical
		// resolution — even though an inline reject lands in `output-denied` while a
		// control-plane reject lands in `approval-responded`.
		const fromControlPlane = extractResolvedMemoryApprovals(controlPlane.messages);
		const fromInline = extractResolvedMemoryApprovals(inline);

		assert.deepEqual(fromInline, fromControlPlane);
		assert.deepEqual(fromInline, [{ status: decision, toolCallId: TOOL_CALL_ID }]);
	}
});

test("either surface resolves the same pending Approval row out of the queue", async () => {
	for (const decision of DECISIONS) {
		const approved = decision === "approved";
		const resolvedAt = new Date();

		// The control plane resolves the row with the decision directly, the way
		// `decideMemoryApproval` does after flipping the transcript.
		const controlPlaneDb = createTestProductDb();
		await seed(controlPlaneDb);
		const controlPlaneRow = await resolveThinkspaceApproval(controlPlaneDb, {
			approvalId: APPROVAL_ID,
			resolvedAt,
			status: decision,
			thinkspaceId: THINKSPACE_ID,
		});

		// The inline surface resolves the row the way `reconcilePendingApprovals`
		// does: derive the status from the native-decided transcript, then resolve
		// through the same repository call.
		const inlineDb = createTestProductDb();
		await seed(inlineDb);
		const [resolution] = extractResolvedMemoryApprovals(
			applyInlineNativeDecision(parkedTranscript(), approved),
		);
		assert.ok(resolution);
		const inlineRow = await resolveThinkspaceApproval(inlineDb, {
			approvalId: APPROVAL_ID,
			resolvedAt,
			status: resolution.status,
			thinkspaceId: THINKSPACE_ID,
		});

		// Both land the row in the identical decided state and clear it from the queue.
		assert.equal(inlineRow?.status, controlPlaneRow?.status);
		assert.equal(inlineRow?.status, decision);
		assert.deepEqual(
			await listPendingThinkspaceApprovals(inlineDb, { thinkspaceId: THINKSPACE_ID }),
			[],
		);
	}
});
