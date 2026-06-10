/**
 * Dependency-direction checks (ADR-0006): the product domain stays
 * authoritative and never imports the Project Think runtime substrate.
 * Think imports are allowed only in the runtime adapter (apps/server).
 */
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const API_SRC_DIR = path.join(import.meta.dirname, "..");
const DB_SRC_DIR = path.join(import.meta.dirname, "../../../db/src");

const listSourceFiles = (dir: string): string[] =>
	readdirSync(dir, { recursive: true, withFileTypes: true })
		.filter((entry) => entry.isFile() && entry.name.endsWith(".ts"))
		.map((entry) => path.join(entry.parentPath, entry.name));

const importsModule = (source: string, moduleName: string): boolean =>
	new RegExp(`(from\\s+["']|require\\(["']|import\\(["'])${moduleName}`, "u").test(source);

test("domain packages never import the Project Think runtime substrate", () => {
	for (const dir of [API_SRC_DIR, DB_SRC_DIR]) {
		for (const file of listSourceFiles(dir)) {
			const source = readFileSync(file, "utf-8");
			assert.equal(
				importsModule(source, "@cloudflare/think"),
				false,
				`${file} must not import @cloudflare/think; Think stays behind the runtime adapter (ADR-0006).`,
			);
		}
	}
});

test("the Agent Profile domain module never reaches runtime or transport concerns", () => {
	const source = readFileSync(path.join(import.meta.dirname, "agent-profile.ts"), "utf-8");

	for (const forbidden of ["@cloudflare/think", "@orpc/", "hono", "@ai-sdk/"]) {
		assert.equal(
			importsModule(source, forbidden),
			false,
			`agent-profile.ts must not depend on "${forbidden}".`,
		);
	}
});
