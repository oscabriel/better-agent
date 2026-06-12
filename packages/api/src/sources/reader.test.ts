import assert from "node:assert/strict";
import test from "node:test";

import type { ProductDb } from "@better-agent/db";
import { user } from "@better-agent/db/schema/auth";
import { thinkspaceSources } from "@better-agent/db/schema/sources";
import { thinkspaces } from "@better-agent/db/schema/thinkspaces";

import { createTestProductDb } from "../testing/product-db";
import { SourceContentStorageError, sourceContentKey } from "./content-store";
import type { SourceContentStore } from "./content-store";
import { createThinkspaceSourceReader } from "./reader";

const THINKSPACE_A = "thinkspace_reader_a";
const THINKSPACE_B = "thinkspace_reader_b";

const seedThinkspacesWithSource = async (db: ProductDb) => {
	await db.insert(user).values({
		email: "owner@example.com",
		id: "owner_user",
		name: "Owner",
	});
	await db.insert(thinkspaces).values([
		{ goal: "Vendor decision", id: THINKSPACE_A, ownerUserId: "owner_user" },
		{ goal: "Migration planning", id: THINKSPACE_B, ownerUserId: "owner_user" },
	]);
	await db.insert(thinkspaceSources).values({
		contentType: "text/markdown",
		description: "Pricing notes",
		id: "source_a",
		name: "Vendor pricing",
		sizeBytes: 17,
		thinkspaceId: THINKSPACE_A,
	});
};

const memoryContentStore = (blobs: Record<string, string>): SourceContentStore => ({
	deleteContent: () => Promise.resolve(),
	getContent: ({ sourceId, thinkspaceId }) =>
		Promise.resolve(blobs[sourceContentKey({ sourceId, thinkspaceId })] ?? null),
	putContent: () => Promise.resolve(),
});

test("the reader lists the bound Thinkspace's manifest and reads content through the store", async () => {
	const db = createTestProductDb();
	await seedThinkspacesWithSource(db);
	const reader = createThinkspaceSourceReader({
		contentStore: memoryContentStore({
			[sourceContentKey({ sourceId: "source_a", thinkspaceId: THINKSPACE_A })]: "Vendor A: $99/mo.",
		}),
		db,
		thinkspaceId: THINKSPACE_A,
	});

	const manifest = await reader.listManifest();
	assert.deepEqual(manifest, [
		{ description: "Pricing notes", id: "source_a", name: "Vendor pricing", sizeBytes: 17 },
	]);

	const document = await reader.read("source_a");
	assert.equal(document?.content, "Vendor A: $99/mo.");
	assert.equal(document?.name, "Vendor pricing");
});

test("a reader bound to a sibling Thinkspace cannot see or read the Source, even with the real id", async () => {
	const db = createTestProductDb();
	await seedThinkspacesWithSource(db);
	const reader = createThinkspaceSourceReader({
		contentStore: memoryContentStore({
			[sourceContentKey({ sourceId: "source_a", thinkspaceId: THINKSPACE_A })]: "Vendor A: $99/mo.",
		}),
		db,
		thinkspaceId: THINKSPACE_B,
	});

	assert.deepEqual(await reader.listManifest(), []);
	assert.equal(await reader.read("source_a"), null);
});

test("a Source whose blob is gone reads as unavailable rather than leaking storage state", async () => {
	const db = createTestProductDb();
	await seedThinkspacesWithSource(db);
	const reader = createThinkspaceSourceReader({
		contentStore: memoryContentStore({}),
		db,
		thinkspaceId: THINKSPACE_A,
	});

	assert.equal(await reader.read("source_a"), null);
});

test("a missing storage binding surfaces the content store's product-safe error", async () => {
	const db = createTestProductDb();
	await seedThinkspacesWithSource(db);
	const reader = createThinkspaceSourceReader({ db, thinkspaceId: THINKSPACE_A });

	await assert.rejects(reader.read("source_a"), SourceContentStorageError);
});
