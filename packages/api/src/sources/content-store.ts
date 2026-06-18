/**
 * Storage seam for Source content blobs. Index rows live in D1; the verbatim
 * content lives in the SOURCES_ARTIFACTS R2 bucket (ADR-0002 storage split).
 * Everything above this seam speaks in Sources; nothing above it learns which
 * binding or bucket failed when storage is unavailable.
 */

/**
 * Raised when Source content storage cannot serve a read or write. The
 * message is product-safe by construction: callers may surface it verbatim.
 */
export class SourceContentStorageError extends Error {
	constructor() {
		super("Source storage is unavailable right now. Try again shortly.");
		this.name = "SourceContentStorageError";
	}
}

export interface SourceContentKeyInput {
	sourceId: string;
	thinkspaceId: string;
}

/**
 * Blob keys carry the owning Thinkspace id so content is namespaced per
 * Thinkspace all the way down to storage, mirroring the index-row scoping.
 */
export const sourceContentKey = ({ sourceId, thinkspaceId }: SourceContentKeyInput): string =>
	`thinkspaces/${thinkspaceId}/sources/${sourceId}`;

export interface SourceContentStore {
	deleteContent: (input: SourceContentKeyInput) => Promise<void>;
	getContent: (input: SourceContentKeyInput) => Promise<string | null>;
	putContent: (input: SourceContentKeyInput & { content: string }) => Promise<void>;
}

const guardStorage = async <T>(operation: () => Promise<T>): Promise<T> => {
	try {
		return await operation();
	} catch {
		throw new SourceContentStorageError();
	}
};

export const createSourceContentStore = (env: {
	SOURCES_ARTIFACTS?: R2Bucket;
}): SourceContentStore => {
	const bucket = env.SOURCES_ARTIFACTS;

	if (!bucket) {
		return {
			deleteContent: () => Promise.reject(new SourceContentStorageError()),
			getContent: () => Promise.reject(new SourceContentStorageError()),
			putContent: () => Promise.reject(new SourceContentStorageError()),
		};
	}

	return {
		deleteContent: (input) => guardStorage(() => bucket.delete(sourceContentKey(input))),
		getContent: (input) =>
			guardStorage(async () => {
				const object = await bucket.get(sourceContentKey(input));

				if (!object) {
					return null;
				}

				return await object.text();
			}),
		putContent: (input) =>
			guardStorage(async () => {
				await bucket.put(sourceContentKey(input), input.content);
			}),
	};
};
