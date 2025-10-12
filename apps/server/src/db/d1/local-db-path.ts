import fs from "node:fs";
import path from "node:path";

/**
 * Finds the local D1 database file path from Alchemy's miniflare directory
 */
export function getLocalD1Path(): string {
	const miniflareDir = path.resolve(
		process.cwd(),
		"../../.alchemy/miniflare/v3/d1/miniflare-D1DatabaseObject",
	);

	if (!fs.existsSync(miniflareDir)) {
		throw new Error(
			`Local D1 database directory not found at ${miniflareDir}. Make sure you've run 'alchemy dev' first.`,
		);
	}

	const files = fs.readdirSync(miniflareDir);
	const sqliteFile = files.find((file) => file.endsWith(".sqlite"));

	if (!sqliteFile) {
		throw new Error(
			`No SQLite database file found in ${miniflareDir}. Make sure your local D1 database is initialized.`,
		);
	}

	return path.join(miniflareDir, sqliteFile);
}
