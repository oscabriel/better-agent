/**
 * The governed read seam the Thinkspace Agent runtime uses to reach Sources.
 * A reader is constructed bound to exactly one Thinkspace: every lookup is
 * keyed by (thinkspaceId, sourceId) together, so even a confused model
 * holding a forged Source id from another Thinkspace reads "not found".
 * Storage failures stay behind the content-store seam's product-safe error.
 */
import type { ProductDb } from "@better-agent/db";

import { createSourceContentStore } from "./content-store";
import type { SourceContentStore } from "./content-store";
import { getThinkspaceSource, listThinkspaceSources } from "./repository";

export interface ThinkspaceSourceManifestEntry {
	description: string;
	id: string;
	name: string;
	sizeBytes: number;
}

export interface ThinkspaceSourceDocument extends ThinkspaceSourceManifestEntry {
	content: string;
}

export interface ThinkspaceSourceReader {
	listManifest: () => Promise<ThinkspaceSourceManifestEntry[]>;
	/** Resolves null when no Source with this id exists in the bound Thinkspace. */
	read: (sourceId: string) => Promise<ThinkspaceSourceDocument | null>;
}

export const createThinkspaceSourceReader = ({
	contentStore,
	db,
	env,
	thinkspaceId,
}: {
	contentStore?: SourceContentStore;
	db: ProductDb;
	env?: { SOURCES_ARTIFACTS?: R2Bucket };
	thinkspaceId: string;
}): ThinkspaceSourceReader => {
	const store = contentStore ?? createSourceContentStore(env ?? {});

	return {
		listManifest: async () => {
			const sources = await listThinkspaceSources(db, { thinkspaceId });

			return sources.map((source) => ({
				description: source.description,
				id: source.id,
				name: source.name,
				sizeBytes: source.sizeBytes,
			}));
		},
		read: async (sourceId) => {
			const source = await getThinkspaceSource(db, { sourceId, thinkspaceId });

			if (!source) {
				return null;
			}

			const content = await store.getContent({ sourceId: source.id, thinkspaceId });

			if (content === null) {
				return null;
			}

			return {
				content,
				description: source.description,
				id: source.id,
				name: source.name,
				sizeBytes: source.sizeBytes,
			};
		},
	};
};
