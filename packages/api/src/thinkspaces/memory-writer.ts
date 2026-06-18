import type { ProductDb } from "@better-agent/db";

import { createThinkspaceMemory } from "./memories-repository";

export interface ThinkspaceMemoryWriteInput {
	content: string;
	toolCallId: string;
}

/**
 * The seam the held Memory-proposing tool writes through once an Approval is
 * granted. Defined as an interface so the runtime tool stays unaware of storage
 * and tests can substitute a recorder.
 */
export interface ThinkspaceMemoryWriter {
	write: (input: ThinkspaceMemoryWriteInput) => Promise<void>;
}

export interface CreateThinkspaceMemoryWriterInput {
	attribution: { profileRevisionId: string; profileVersion: number } | null;
	db: ProductDb;
	generateId?: () => string;
	thinkspaceId: string;
}

const defaultGenerateMemoryId = (): string => `memory_${crypto.randomUUID()}`;

/**
 * Store-backed Memory writer. Carries the turn's revision attribution so an
 * accepted Memory records which Agent Profile revision proposed it, regardless
 * of how much later the Approval was decided.
 */
export const createThinkspaceMemoryWriter = ({
	attribution,
	db,
	generateId = defaultGenerateMemoryId,
	thinkspaceId,
}: CreateThinkspaceMemoryWriterInput): ThinkspaceMemoryWriter => ({
	write: async ({ content, toolCallId }) => {
		await createThinkspaceMemory(db, {
			record: {
				content,
				id: generateId(),
				profileRevisionId: attribution?.profileRevisionId ?? null,
				profileVersion: attribution?.profileVersion ?? null,
				thinkspaceId,
				toolCallId,
			},
		});
	},
});
