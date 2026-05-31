import { existsSync, readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL, URL } from "node:url";

import dotenv from "dotenv";

export type DrizzleD1Mode = "local" | "remote" | undefined;

const currentModuleUrl = import.meta.url;
const sourceDirectory = fileURLToPath(new URL(".", currentModuleUrl));
const packageDirectory = resolve(sourceDirectory, "..");
const repoRoot = resolve(packageDirectory, "../..");

const envFilePaths = [
	resolve(packageDirectory, ".env"),
	resolve(repoRoot, "apps/server/.env"),
	resolve(repoRoot, "packages/infra/.env"),
];

const localD1SearchDirectories = [
	resolve(repoRoot, ".alchemy/miniflare/v3/d1/miniflare-D1DatabaseObject"),
	resolve(repoRoot, ".wrangler/state/v3/d1/miniflare-D1DatabaseObject"),
	resolve(repoRoot, "packages/infra/.alchemy/miniflare/v3/d1/miniflare-D1DatabaseObject"),
	resolve(repoRoot, "packages/infra/.wrangler/state/v3/d1/miniflare-D1DatabaseObject"),
	resolve(repoRoot, "apps/server/.wrangler/state/v3/d1/miniflare-D1DatabaseObject"),
	resolve(repoRoot, "apps/web/.wrangler/state/v3/d1/miniflare-D1DatabaseObject"),
];

interface LocalD1Candidate {
	mtimeMs: number;
	path: string;
}

const explicitLocalD1DatabaseUrl = () =>
	process.env.D1_LOCAL_DATABASE_URL ??
	process.env.DATABASE_URL ??
	process.env.LOCAL_D1_DATABASE_URL;

const normalizeLocalDatabaseUrl = (url: string) => {
	if (url.startsWith("file:") || url.includes("://")) {
		return url;
	}

	return pathToFileURL(resolve(url)).href;
};

const isLocalD1SqliteFile = (fileName: string) =>
	(fileName.endsWith(".sqlite") || fileName.endsWith(".sqlite3")) && fileName !== "metadata.sqlite";

const findLocalD1Candidates = (directory: string, maxDepth = 2): LocalD1Candidate[] => {
	if (!(maxDepth >= 0) || !existsSync(directory)) {
		return [];
	}

	const candidates: LocalD1Candidate[] = [];

	for (const entry of readdirSync(directory, { withFileTypes: true })) {
		const entryPath = resolve(directory, entry.name);

		if (entry.isDirectory()) {
			candidates.push(...findLocalD1Candidates(entryPath, maxDepth - 1));
			continue;
		}

		if (!entry.isFile() || !isLocalD1SqliteFile(entry.name)) {
			continue;
		}

		const stats = statSync(entryPath);

		if (stats.size === 0) {
			continue;
		}

		candidates.push({
			mtimeMs: stats.mtimeMs,
			path: entryPath,
		});
	}

	return candidates;
};

const discoverLocalD1SqliteFile = () => {
	const candidates = localD1SearchDirectories.flatMap((directory) =>
		findLocalD1Candidates(directory),
	);
	const [newestCandidate] = candidates.toSorted((left, right) => right.mtimeMs - left.mtimeMs);

	return newestCandidate?.path;
};

const requiredEnv = (name: string): string => {
	const value = process.env[name];

	if (!value) {
		throw new Error(`Missing required environment variable: ${name}`);
	}

	return value;
};

export const loadDrizzleEnv = () => {
	for (const path of envFilePaths) {
		dotenv.config({ path });
	}
};

export const getDrizzleD1Mode = (): DrizzleD1Mode => {
	const mode = process.env.DRIZZLE_D1_MODE ?? process.env.DRIZZLE_D1_MIGRATION_MODE;

	if (mode === undefined || mode === "") {
		return undefined;
	}

	if (mode === "local" || mode === "remote") {
		return mode;
	}

	throw new Error(
		`Unsupported Drizzle D1 mode: ${mode}. Expected DRIZZLE_D1_MODE=local or DRIZZLE_D1_MODE=remote.`,
	);
};

export const resolveLocalD1DatabaseUrl = (): string => {
	const explicitUrl = explicitLocalD1DatabaseUrl();

	if (explicitUrl) {
		return normalizeLocalDatabaseUrl(explicitUrl);
	}

	const discoveredPath = discoverLocalD1SqliteFile();

	if (discoveredPath) {
		return pathToFileURL(discoveredPath).href;
	}

	throw new Error(
		[
			"Missing local D1 database URL and could not auto-discover an Alchemy/Wrangler local D1 .sqlite file.",
			"Set D1_LOCAL_DATABASE_URL=file:/path/to/.sqlite, or start local dev once so Miniflare creates a local D1 database.",
			"Searched:",
			...localD1SearchDirectories.map((path) => `- ${path}`),
		].join("\n"),
	);
};

export const resolveRemoteD1DatabaseCredentials = () => {
	const databaseId = process.env.CLOUDFLARE_DATABASE_ID ?? process.env.CLOUDFLARE_D1_DATABASE_ID;

	if (!databaseId) {
		throw new Error(
			"Missing remote D1 database ID. Set CLOUDFLARE_DATABASE_ID or CLOUDFLARE_D1_DATABASE_ID before running remote D1 commands.",
		);
	}

	return {
		accountId: requiredEnv("CLOUDFLARE_ACCOUNT_ID"),
		databaseId,
		token: requiredEnv("CLOUDFLARE_API_TOKEN"),
	};
};
