import type { ThinkspaceSource } from "@better-agent/db/schema/sources";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import { protectedProcedure } from "../procedures";
import { getThinkspace } from "../thinkspaces/repository";
import { createSourceContentStore, SourceContentStorageError } from "./content-store";
import {
	createThinkspaceSource,
	deleteThinkspaceSource,
	getThinkspaceSource,
	listThinkspaceSources,
} from "./repository";
import {
	SOURCE_CONTENT_TYPES,
	SOURCE_DESCRIPTION_MAX_LENGTH,
	SOURCE_NAME_MAX_LENGTH,
	SourceUploadValidationError,
	validateSourceUpload,
} from "./source-upload";

const thinkspaceIdInput = z.object({
	thinkspaceId: z.string().min(1),
});

const sourceIdInput = thinkspaceIdInput.extend({
	sourceId: z.string().min(1),
});

const uploadSourceInput = thinkspaceIdInput.extend({
	content: z.string().min(1),
	contentType: z.enum(SOURCE_CONTENT_TYPES),
	description: z.string().max(SOURCE_DESCRIPTION_MAX_LENGTH).optional(),
	name: z.string().min(1).max(SOURCE_NAME_MAX_LENGTH),
});

const createSourceId = (): string => `source_${crypto.randomUUID()}`;

const toNotFound = (): ORPCError<"NOT_FOUND", undefined> =>
	new ORPCError("NOT_FOUND", { message: "Thinkspace was not found." });

const toSourceNotFound = (): ORPCError<"NOT_FOUND", undefined> =>
	new ORPCError("NOT_FOUND", { message: "Source was not found." });

const toStorageUnavailable = (error: SourceContentStorageError) =>
	new ORPCError("INTERNAL_SERVER_ERROR", { message: error.message });

const throwProductSafeSourceError = (error: unknown): never => {
	if (error instanceof SourceUploadValidationError) {
		throw new ORPCError("BAD_REQUEST", { message: error.message });
	}

	if (error instanceof SourceContentStorageError) {
		throw toStorageUnavailable(error);
	}

	throw error;
};

const toSourceSummary = (source: ThinkspaceSource) => ({
	contentType: source.contentType,
	createdAt: source.createdAt,
	description: source.description,
	id: source.id,
	name: source.name,
	sizeBytes: source.sizeBytes,
	thinkspaceId: source.thinkspaceId,
});

export const sourcesRouter = {
	delete: protectedProcedure.input(sourceIdInput).handler(async ({ context, input }) => {
		const thinkspace = await getThinkspace(context.db, {
			ownerUserId: context.session.user.id,
			thinkspaceId: input.thinkspaceId,
		});

		if (!thinkspace) {
			throw toNotFound();
		}

		const source = await getThinkspaceSource(context.db, {
			sourceId: input.sourceId,
			thinkspaceId: thinkspace.id,
		});

		if (!source) {
			throw toSourceNotFound();
		}

		try {
			// Blob first: if storage is unavailable the index row survives and
			// the delete reports failure, instead of leaving an orphaned blob
			// behind a row that no longer exists.
			await createSourceContentStore(context.env).deleteContent({
				sourceId: source.id,
				thinkspaceId: thinkspace.id,
			});
		} catch (error) {
			throwProductSafeSourceError(error);
		}

		const deleted = await deleteThinkspaceSource(context.db, {
			sourceId: source.id,
			thinkspaceId: thinkspace.id,
		});

		if (!deleted) {
			throw toSourceNotFound();
		}

		return {
			deletedSourceId: deleted.id,
			thinkspaceId: thinkspace.id,
		};
	}),
	getContent: protectedProcedure.input(sourceIdInput).handler(async ({ context, input }) => {
		const thinkspace = await getThinkspace(context.db, {
			ownerUserId: context.session.user.id,
			thinkspaceId: input.thinkspaceId,
		});

		if (!thinkspace) {
			throw toNotFound();
		}

		const source = await getThinkspaceSource(context.db, {
			sourceId: input.sourceId,
			thinkspaceId: thinkspace.id,
		});

		if (!source) {
			throw toSourceNotFound();
		}

		try {
			const content = await createSourceContentStore(context.env).getContent({
				sourceId: source.id,
				thinkspaceId: thinkspace.id,
			});

			if (content === null) {
				throw new SourceContentStorageError();
			}

			return { ...toSourceSummary(source), content };
		} catch (error) {
			throwProductSafeSourceError(error);
		}
	}),
	list: protectedProcedure.input(thinkspaceIdInput).handler(async ({ context, input }) => {
		const thinkspace = await getThinkspace(context.db, {
			ownerUserId: context.session.user.id,
			thinkspaceId: input.thinkspaceId,
		});

		if (!thinkspace) {
			throw toNotFound();
		}

		const sources = await listThinkspaceSources(context.db, { thinkspaceId: thinkspace.id });

		return sources.map(toSourceSummary);
	}),
	upload: protectedProcedure.input(uploadSourceInput).handler(async ({ context, input }) => {
		const thinkspace = await getThinkspace(context.db, {
			ownerUserId: context.session.user.id,
			thinkspaceId: input.thinkspaceId,
		});

		if (!thinkspace) {
			throw toNotFound();
		}

		try {
			const upload = validateSourceUpload({
				content: input.content,
				contentType: input.contentType,
				description: input.description,
				name: input.name,
			});
			const sourceId = createSourceId();

			// Blob before index row: a failed insert can orphan a blob, but the
			// reverse order could index a Source whose content never landed.
			await createSourceContentStore(context.env).putContent({
				content: upload.content,
				sourceId,
				thinkspaceId: thinkspace.id,
			});

			const created = await createThinkspaceSource(context.db, {
				record: {
					contentType: upload.contentType,
					description: upload.description,
					id: sourceId,
					name: upload.name,
					sizeBytes: upload.sizeBytes,
					thinkspaceId: thinkspace.id,
				},
			});

			return toSourceSummary(created);
		} catch (error) {
			throwProductSafeSourceError(error);
		}
	}),
};
