import assert from "node:assert/strict";
import test from "node:test";

import type { ProductDb } from "@better-agent/db";
import { user } from "@better-agent/db/schema/auth";
import { thinkspaces } from "@better-agent/db/schema/thinkspaces";
import { ORPCError, call } from "@orpc/server";
import type { AnyProcedure } from "@orpc/server";

import type { Context } from "../context";
import { createTestProductDb } from "../testing/product-db";
import { sourcesRouter } from "./router";
import { SOURCE_CONTENT_MAX_BYTES } from "./source-upload";

const OWNED_THINKSPACE_ID = "thinkspace_sources";
const OTHER_THINKSPACE_ID = "thinkspace_sources_other";

const authenticatedSession = {
	session: { id: "session_1" },
	user: { id: "owner_user" },
};

const nonOwnerSession = {
	session: { id: "session_2" },
	user: { id: "other_user" },
};

/**
 * A db that fails the test if any query is attempted. Used to prove that
 * rejected requests never reach product storage.
 */
const untouchableDb = new Proxy({} as Record<string, unknown>, {
	get(_target, property) {
		throw new Error(`Product storage must not be touched (accessed ${String(property)}).`);
	},
}) as unknown as ProductDb;

/**
 * An R2 bucket that fails the test if any blob operation is attempted. Used
 * to prove that rejected uploads never reach content storage.
 */
const untouchableBucket = new Proxy({} as Record<string, unknown>, {
	get(_target, property) {
		throw new Error(`Content storage must not be touched (accessed ${String(property)}).`);
	},
}) as unknown as R2Bucket;

/**
 * Minimal structural in-memory stand-in for the SOURCES_ARTIFACTS R2 bucket:
 * just the get/put/delete surface the content store seam uses.
 */
const createMemoryBucket = () => {
	const blobs = new Map<string, string>();
	const bucket = {
		delete: (key: string) => {
			blobs.delete(key);
			return Promise.resolve();
		},
		get: (key: string) => {
			const content = blobs.get(key);

			if (content === undefined) {
				return Promise.resolve(null);
			}

			return Promise.resolve({ text: () => Promise.resolve(content) });
		},
		put: (key: string, value: string) => {
			blobs.set(key, value);
			return Promise.resolve(null);
		},
	};

	return { blobs, bucket: bucket as unknown as R2Bucket };
};

const createCallContext = ({
	bucket,
	db,
	session = authenticatedSession,
}: {
	bucket?: R2Bucket;
	db: ProductDb;
	session?: typeof authenticatedSession | null;
}): Context =>
	({
		db,
		env: bucket ? { SOURCES_ARTIFACTS: bucket } : {},
		executionCtx: undefined,
		headers: new Headers(),
		modelCatalog: undefined,
		session,
	}) as unknown as Context;

const seedOwnedThinkspaces = async (db: ProductDb) => {
	await db.insert(user).values({
		email: "owner@example.com",
		id: authenticatedSession.user.id,
		name: "Owner",
	});
	await db.insert(thinkspaces).values([
		{
			goal: "Decide between observability vendors",
			id: OWNED_THINKSPACE_ID,
			ownerUserId: authenticatedSession.user.id,
			status: "active",
		},
		{
			goal: "Plan the database migration",
			id: OTHER_THINKSPACE_ID,
			ownerUserId: authenticatedSession.user.id,
			status: "active",
		},
	]);
};

const uploadInput = (overrides: Record<string, unknown> = {}) => ({
	content: "# Vendor pricing\n\nVendor A: $99/mo.",
	contentType: "text/markdown" as const,
	description: "Exported pricing notes",
	name: "Vendor pricing",
	thinkspaceId: OWNED_THINKSPACE_ID,
	...overrides,
});

const expectCode =
	(code: string) =>
	(error: unknown): boolean =>
		error instanceof ORPCError && error.code === code;

const expectProductSafeStorageFailure = (error: unknown): boolean => {
	assert.ok(error instanceof ORPCError);
	assert.equal(error.code, "INTERNAL_SERVER_ERROR");
	assert.doesNotMatch(error.message, /R2/u);
	assert.doesNotMatch(error.message, /binding/iu);
	assert.doesNotMatch(error.message, /SOURCES_ARTIFACTS/u);
	assert.doesNotMatch(error.message, /bucket/iu);
	return true;
};

test("a Source round-trips verbatim through upload, list, getContent, and delete", async () => {
	const db = createTestProductDb();
	const { blobs, bucket } = createMemoryBucket();
	await seedOwnedThinkspaces(db);
	const context = createCallContext({ bucket, db });

	const uploaded = await call(sourcesRouter.upload, uploadInput(), { context });

	assert.ok(uploaded);
	assert.equal(uploaded.name, "Vendor pricing");
	assert.equal(uploaded.description, "Exported pricing notes");
	assert.equal(uploaded.contentType, "text/markdown");
	assert.equal(uploaded.sizeBytes, 35);
	assert.equal(uploaded.thinkspaceId, OWNED_THINKSPACE_ID);
	assert.equal("content" in uploaded, false);

	const listed = await call(sourcesRouter.list, { thinkspaceId: OWNED_THINKSPACE_ID }, { context });
	assert.equal(listed.length, 1);
	assert.equal(listed[0]?.id, uploaded.id);
	assert.equal(listed[0]?.sizeBytes, 35);
	assert.ok(listed[0]?.createdAt instanceof Date);

	const content = await call(
		sourcesRouter.getContent,
		{ sourceId: uploaded.id, thinkspaceId: OWNED_THINKSPACE_ID },
		{ context },
	);
	assert.ok(content);
	assert.equal(content.content, "# Vendor pricing\n\nVendor A: $99/mo.");
	assert.equal(content.name, "Vendor pricing");

	const deleted = await call(
		sourcesRouter.delete,
		{ sourceId: uploaded.id, thinkspaceId: OWNED_THINKSPACE_ID },
		{ context },
	);
	assert.equal(deleted.deletedSourceId, uploaded.id);
	assert.equal(blobs.size, 0);

	const afterDelete = await call(
		sourcesRouter.list,
		{ thinkspaceId: OWNED_THINKSPACE_ID },
		{ context },
	);
	assert.deepEqual(afterDelete, []);

	await assert.rejects(
		call(
			sourcesRouter.getContent,
			{ sourceId: uploaded.id, thinkspaceId: OWNED_THINKSPACE_ID },
			{ context },
		),
		expectCode("NOT_FOUND"),
	);
});

test("the size cap is enforced in bytes before any storage is touched", async () => {
	const db = createTestProductDb();
	await seedOwnedThinkspaces(db);
	const context = createCallContext({ bucket: untouchableBucket, db });

	// One past the cap in plain ASCII.
	await assert.rejects(
		call(sourcesRouter.upload, uploadInput({ content: "x".repeat(SOURCE_CONTENT_MAX_BYTES + 1) }), {
			context,
		}),
		(error: unknown) => {
			assert.ok(error instanceof ORPCError);
			assert.equal(error.code, "BAD_REQUEST");
			assert.match(error.message, /KB/u);
			return true;
		},
	);

	// Under the cap in characters but over it in UTF-8 bytes (3 bytes each).
	await assert.rejects(
		call(
			sourcesRouter.upload,
			uploadInput({ content: "縦".repeat(Math.floor(SOURCE_CONTENT_MAX_BYTES / 3) + 1) }),
			{ context },
		),
		expectCode("BAD_REQUEST"),
	);
});

test("unsupported content types and malformed uploads reject at the boundary without touching storage", async () => {
	const context = createCallContext({ bucket: untouchableBucket, db: untouchableDb });
	const malformed: Record<string, unknown>[] = [
		uploadInput({ contentType: "application/pdf" }),
		uploadInput({ contentType: "text/html" }),
		uploadInput({ content: "" }),
		uploadInput({ name: "" }),
		uploadInput({ name: "n".repeat(121) }),
		uploadInput({ description: "d".repeat(501) }),
	];

	for (const input of malformed) {
		await assert.rejects(
			call(sourcesRouter.upload as AnyProcedure, input, { context }),
			expectCode("BAD_REQUEST"),
		);
	}
});

test("a name of only whitespace rejects after thinkspace verification with a product-safe message", async () => {
	const db = createTestProductDb();
	await seedOwnedThinkspaces(db);
	const context = createCallContext({ bucket: untouchableBucket, db });

	await assert.rejects(
		call(sourcesRouter.upload, uploadInput({ name: "   " }), { context }),
		(error: unknown) => {
			assert.ok(error instanceof ORPCError);
			assert.equal(error.code, "BAD_REQUEST");
			assert.match(error.message, /name/u);
			return true;
		},
	);
});

test("unauthenticated requests cannot reach any Sources operation", async () => {
	const operations: { input: Record<string, unknown>; name: string; procedure: AnyProcedure }[] = [
		{ input: uploadInput(), name: "upload", procedure: sourcesRouter.upload },
		{
			input: { thinkspaceId: OWNED_THINKSPACE_ID },
			name: "list",
			procedure: sourcesRouter.list,
		},
		{
			input: { sourceId: "source_1", thinkspaceId: OWNED_THINKSPACE_ID },
			name: "getContent",
			procedure: sourcesRouter.getContent,
		},
		{
			input: { sourceId: "source_1", thinkspaceId: OWNED_THINKSPACE_ID },
			name: "delete",
			procedure: sourcesRouter.delete,
		},
	];

	for (const operation of operations) {
		await assert.rejects(
			call(operation.procedure, operation.input, {
				context: createCallContext({
					bucket: untouchableBucket,
					db: untouchableDb,
					session: null,
				}),
			}),
			expectCode("UNAUTHORIZED"),
			`${operation.name} must reject unauthenticated requests`,
		);
	}
});

test("authenticated non-owners get NOT_FOUND for every Sources operation", async () => {
	const db = createTestProductDb();
	const { bucket } = createMemoryBucket();
	await seedOwnedThinkspaces(db);
	const ownerContext = createCallContext({ bucket, db });
	const uploaded = await call(sourcesRouter.upload, uploadInput(), { context: ownerContext });

	assert.ok(uploaded);

	const nonOwnerContext = createCallContext({ bucket, db, session: nonOwnerSession });
	const operations: { input: Record<string, unknown>; name: string; procedure: AnyProcedure }[] = [
		{ input: uploadInput(), name: "upload", procedure: sourcesRouter.upload },
		{
			input: { thinkspaceId: OWNED_THINKSPACE_ID },
			name: "list",
			procedure: sourcesRouter.list,
		},
		{
			input: { sourceId: uploaded.id, thinkspaceId: OWNED_THINKSPACE_ID },
			name: "getContent",
			procedure: sourcesRouter.getContent,
		},
		{
			input: { sourceId: uploaded.id, thinkspaceId: OWNED_THINKSPACE_ID },
			name: "delete",
			procedure: sourcesRouter.delete,
		},
	];

	for (const operation of operations) {
		await assert.rejects(
			call(operation.procedure, operation.input, { context: nonOwnerContext }),
			expectCode("NOT_FOUND"),
			`${operation.name} must hide other users' Thinkspaces`,
		);
	}

	const stillThere = await call(
		sourcesRouter.list,
		{ thinkspaceId: OWNED_THINKSPACE_ID },
		{ context: ownerContext },
	);
	assert.equal(stillThere.length, 1);
});

test("guessed Thinkspace and Source ids cannot resolve any Sources operation", async () => {
	const db = createTestProductDb();
	const { bucket } = createMemoryBucket();
	await seedOwnedThinkspaces(db);
	const context = createCallContext({ bucket, db });

	await assert.rejects(
		call(sourcesRouter.list, { thinkspaceId: "thinkspace_guessed" }, { context }),
		expectCode("NOT_FOUND"),
	);
	await assert.rejects(
		call(
			sourcesRouter.getContent,
			{ sourceId: "source_guessed", thinkspaceId: OWNED_THINKSPACE_ID },
			{ context },
		),
		expectCode("NOT_FOUND"),
	);
	await assert.rejects(
		call(
			sourcesRouter.delete,
			{ sourceId: "source_guessed", thinkspaceId: OWNED_THINKSPACE_ID },
			{ context },
		),
		expectCode("NOT_FOUND"),
	);
});

test("a Source is sealed to its own Thinkspace even with a forged id from a sibling", async () => {
	const db = createTestProductDb();
	const { bucket } = createMemoryBucket();
	await seedOwnedThinkspaces(db);
	const context = createCallContext({ bucket, db });
	const uploaded = await call(sourcesRouter.upload, uploadInput(), { context });

	assert.ok(uploaded);
	// Same owner, different Thinkspace: the forged cross-Thinkspace read and
	// delete must both be indistinguishable from the Source not existing.
	await assert.rejects(
		call(
			sourcesRouter.getContent,
			{ sourceId: uploaded.id, thinkspaceId: OTHER_THINKSPACE_ID },
			{ context },
		),
		expectCode("NOT_FOUND"),
	);
	await assert.rejects(
		call(
			sourcesRouter.delete,
			{ sourceId: uploaded.id, thinkspaceId: OTHER_THINKSPACE_ID },
			{ context },
		),
		expectCode("NOT_FOUND"),
	);

	const siblingList = await call(
		sourcesRouter.list,
		{ thinkspaceId: OTHER_THINKSPACE_ID },
		{ context },
	);
	assert.deepEqual(siblingList, []);

	const ownList = await call(
		sourcesRouter.list,
		{ thinkspaceId: OWNED_THINKSPACE_ID },
		{ context },
	);
	assert.equal(ownList.length, 1);
});

test("a missing storage binding surfaces a product-safe error without binding detail", async () => {
	const db = createTestProductDb();
	await seedOwnedThinkspaces(db);
	const context = createCallContext({ db });

	await assert.rejects(
		call(sourcesRouter.upload, uploadInput(), { context }),
		expectProductSafeStorageFailure,
	);

	// The failed upload must not leave a phantom index row behind.
	const listed = await call(sourcesRouter.list, { thinkspaceId: OWNED_THINKSPACE_ID }, { context });
	assert.deepEqual(listed, []);
});

test("a Source whose blob is missing degrades with a product-safe error", async () => {
	const db = createTestProductDb();
	const { blobs, bucket } = createMemoryBucket();
	await seedOwnedThinkspaces(db);
	const context = createCallContext({ bucket, db });
	const uploaded = await call(sourcesRouter.upload, uploadInput(), { context });

	assert.ok(uploaded);
	blobs.clear();

	await assert.rejects(
		call(
			sourcesRouter.getContent,
			{ sourceId: uploaded.id, thinkspaceId: OWNED_THINKSPACE_ID },
			{ context },
		),
		expectProductSafeStorageFailure,
	);
});

test("a failed blob delete keeps the index row so the delete reports honestly", async () => {
	const db = createTestProductDb();
	const { bucket } = createMemoryBucket();
	await seedOwnedThinkspaces(db);
	const uploaded = await call(sourcesRouter.upload, uploadInput(), {
		context: createCallContext({ bucket, db }),
	});

	assert.ok(uploaded);

	const failingBucket = {
		delete: () => Promise.reject(new Error("transport detail must not leak")),
	} as unknown as R2Bucket;
	const failingContext = createCallContext({ bucket: failingBucket, db });

	await assert.rejects(
		call(
			sourcesRouter.delete,
			{ sourceId: uploaded.id, thinkspaceId: OWNED_THINKSPACE_ID },
			{ context: failingContext },
		),
		(error: unknown) => {
			assert.ok(error instanceof ORPCError);
			assert.equal(error.code, "INTERNAL_SERVER_ERROR");
			assert.doesNotMatch(error.message, /transport detail/u);
			return true;
		},
	);

	const listed = await call(
		sourcesRouter.list,
		{ thinkspaceId: OWNED_THINKSPACE_ID },
		{ context: createCallContext({ bucket, db }) },
	);
	assert.equal(listed.length, 1);
});

test("uploads trim the name and description and default the description to empty", async () => {
	const db = createTestProductDb();
	const { bucket } = createMemoryBucket();
	await seedOwnedThinkspaces(db);
	const context = createCallContext({ bucket, db });

	const uploaded = await call(
		sourcesRouter.upload,
		uploadInput({ description: undefined, name: "  Requirements doc  " }),
		{ context },
	);

	assert.ok(uploaded);
	assert.equal(uploaded.name, "Requirements doc");
	assert.equal(uploaded.description, "");
});
