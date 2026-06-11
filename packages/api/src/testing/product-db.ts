/**
 * Real test database support: an in-memory SQLite database with the actual
 * product migrations applied, wrapped in the same drizzle schema the worker
 * uses. Tests that exercise storage-backed seams (Permission policy, model
 * readiness) run against this instead of hand-faked query stubs, so schema
 * drift fails loudly.
 */
import { readdirSync, readFileSync } from "node:fs";

import type { ProductDb } from "@better-agent/db";
import * as schema from "@better-agent/db/schema/index";
import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";

const MIGRATIONS_DIR = decodeURIComponent(
	new URL("../../../db/src/migrations/", import.meta.url).pathname,
);
const STATEMENT_BREAKPOINT = "--> statement-breakpoint";

export const createTestProductDb = (): ProductDb => {
	const sqlite = new Database(":memory:");
	const migrationFiles = readdirSync(MIGRATIONS_DIR)
		.filter((file) => file.endsWith(".sql"))
		.toSorted((left, right) => left.localeCompare(right));

	for (const file of migrationFiles) {
		const migration = readFileSync(`${MIGRATIONS_DIR}/${file}`, "utf-8");

		for (const statement of migration.split(STATEMENT_BREAKPOINT)) {
			const sql = statement.trim();

			if (sql) {
				sqlite.exec(sql);
			}
		}
	}

	return drizzle(sqlite, { schema }) as unknown as ProductDb;
};
