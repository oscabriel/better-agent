import alchemy from "alchemy";
import { D1Database, TanStackStart, Worker } from "alchemy/cloudflare";
import { config } from "dotenv";

config({ path: "./.env" });
config({ path: "../../apps/web/.env" });
config({ path: "../../apps/server/.env" });

const requiredEnv = <T>(value: T | undefined, name: string): T => {
	if (value === undefined) {
		throw new Error(`Missing required environment variable: ${name}`);
	}

	return value;
};

const app = await alchemy("better-agent");

const db = await D1Database("database", {
	migrationsDir: "../../packages/db/src/migrations",
});

const commonBindings = {
	BETTER_AUTH_SECRET: requiredEnv(alchemy.secret.env.BETTER_AUTH_SECRET, "BETTER_AUTH_SECRET"),
	BETTER_AUTH_URL: requiredEnv(alchemy.env.BETTER_AUTH_URL, "BETTER_AUTH_URL"),
	CORS_ORIGIN: requiredEnv(alchemy.env.CORS_ORIGIN, "CORS_ORIGIN"),
	DB: db,
};

export const web = await TanStackStart("web", {
	bindings: {
		...commonBindings,
		VITE_SERVER_URL: requiredEnv(alchemy.env.VITE_SERVER_URL, "VITE_SERVER_URL"),
	},
	cwd: "../../apps/web",
});

export const server = await Worker("server", {
	bindings: commonBindings,
	compatibility: "node",
	cwd: "../../apps/server",
	dev: {
		port: 3000,
	},
	entrypoint: "src/index.ts",
});

console.log(`Web    -> ${web.url}`);
console.log(`Server -> ${server.url}`);

await app.finalize();
