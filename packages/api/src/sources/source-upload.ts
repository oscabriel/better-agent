/**
 * Pure validation for Source uploads. Upload is text-first and verbatim: the
 * product accepts plain text and markdown, enforces a fixed per-file byte
 * cap, and performs no extraction or transformation. Every rejection message
 * is product-safe and states the boundary the caller hit.
 */

export const SOURCE_NAME_MAX_LENGTH = 120;
export const SOURCE_DESCRIPTION_MAX_LENGTH = 500;

/**
 * Fixed per-file cap on the UTF-8 encoded content. Measured in bytes, not
 * characters, so multibyte text cannot slip past the boundary.
 */
export const SOURCE_CONTENT_MAX_BYTES = 262_144;

export const SOURCE_CONTENT_TYPES = ["text/markdown", "text/plain"] as const;

export type SourceContentType = (typeof SOURCE_CONTENT_TYPES)[number];

export class SourceUploadValidationError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "SourceUploadValidationError";
	}
}

export interface ValidatedSourceUpload {
	content: string;
	contentType: SourceContentType;
	description: string;
	name: string;
	sizeBytes: number;
}

export const validateSourceUpload = (input: {
	content: string;
	contentType: SourceContentType;
	description?: string;
	name: string;
}): ValidatedSourceUpload => {
	const name = input.name.trim();

	if (!name) {
		throw new SourceUploadValidationError("A Source needs a name.");
	}

	if (name.length > SOURCE_NAME_MAX_LENGTH) {
		throw new SourceUploadValidationError(
			`A Source name can be at most ${SOURCE_NAME_MAX_LENGTH} characters.`,
		);
	}

	const description = input.description?.trim() ?? "";

	if (description.length > SOURCE_DESCRIPTION_MAX_LENGTH) {
		throw new SourceUploadValidationError(
			`A Source description can be at most ${SOURCE_DESCRIPTION_MAX_LENGTH} characters.`,
		);
	}

	if (!input.content) {
		throw new SourceUploadValidationError("A Source needs content.");
	}

	const sizeBytes = new TextEncoder().encode(input.content).byteLength;

	if (sizeBytes > SOURCE_CONTENT_MAX_BYTES) {
		throw new SourceUploadValidationError(
			`A Source can be at most ${Math.floor(SOURCE_CONTENT_MAX_BYTES / 1024)} KB of text. This upload is ${Math.ceil(sizeBytes / 1024)} KB.`,
		);
	}

	return {
		content: input.content,
		contentType: input.contentType,
		description,
		name,
		sizeBytes,
	};
};
