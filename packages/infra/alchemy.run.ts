import alchemy from "alchemy";
import { D1Database, KVNamespace, R2Bucket, TanStackStart, Worker } from "alchemy/cloudflare";
import { CloudflareStateStore } from "alchemy/state";
import { config } from "dotenv";

const explicitStage = process.env.ALCHEMY_STAGE ?? process.env.STAGE ?? "dev";
const isLocalStage = explicitStage === "dev" || explicitStage === "local";

config({ path: `./.env.${explicitStage}` });
config({ path: `../../apps/web/.env.${explicitStage}` });
config({ path: `../../apps/server/.env.${explicitStage}` });
config({ path: "./.env" });
config({ path: "../../apps/web/.env" });
config({ path: "../../apps/server/.env" });

const app = await alchemy("better-agent", {
	stage: explicitStage,
	stateStore: isLocalStage
		? undefined
		: (scope) =>
				new CloudflareStateStore(scope, {
					stateToken: alchemy.secret.env.ALCHEMY_STATE_TOKEN,
				}),
});

const { stage } = app;
const prefix = `${app.name}-${stage}`;
const adoptPersistentResources = !isLocalStage;

const requiredEnv = <T>(value: T | undefined, name: string): T => {
	if (value === undefined || value === "") {
		throw new Error(`Missing required environment variable: ${name}`);
	}

	return value;
};

const optionalEnv = <T>(value: T | undefined): T | undefined => value;

const db = await D1Database("product-db", {
	adopt: adoptPersistentResources,
	migrationsDir: "../../packages/db/src/migrations",
	name: `${prefix}-product-db`,
	readReplication: adoptPersistentResources ? { mode: "auto" } : undefined,
});

const sessions = await KVNamespace("session-cache", {
	adopt: adoptPersistentResources,
	title: `${prefix}-session-cache`,
});

const sourcesAndArtifacts = await R2Bucket("sources-artifacts", {
	adopt: adoptPersistentResources,
	name: `${prefix}-sources-artifacts`,
});

const commonBindings = {
	ANTHROPIC_API_KEY: optionalEnv(alchemy.secret.env.ANTHROPIC_API_KEY),
	API_ENCRYPTION_KEY: optionalEnv(alchemy.secret.env.API_ENCRYPTION_KEY),
	BETTER_AUTH_SECRET: requiredEnv(alchemy.secret.env.BETTER_AUTH_SECRET, "BETTER_AUTH_SECRET"),
	BETTER_AUTH_URL: requiredEnv(alchemy.env.BETTER_AUTH_URL, "BETTER_AUTH_URL"),
	CORS_ORIGIN: requiredEnv(alchemy.env.CORS_ORIGIN, "CORS_ORIGIN"),
	DB: db,
	GOOGLE_GENERATIVE_AI_API_KEY: optionalEnv(alchemy.secret.env.GOOGLE_GENERATIVE_AI_API_KEY),
	OPENAI_API_KEY: optionalEnv(alchemy.secret.env.OPENAI_API_KEY),
	SESSION_KV: sessions,
	SOURCES_ARTIFACTS: sourcesAndArtifacts,
};

export const web = await TanStackStart("web", {
	adopt: adoptPersistentResources,
	bindings: {
		VITE_SERVER_URL: requiredEnv(alchemy.env.VITE_SERVER_URL, "VITE_SERVER_URL"),
	},
	cwd: "../../apps/web",
	name: `${prefix}-web`,
});

export const server = await Worker("server", {
	adopt: adoptPersistentResources,
	bindings: commonBindings,
	compatibility: "node",
	cwd: "../../apps/server",
	dev: {
		port: 3000,
	},
	entrypoint: "src/index.ts",
	name: `${prefix}-api`,
	observability: {
		enabled: true,
	},
});

console.log(`Stage  -> ${stage}`);
console.log(`Web    -> ${web.url}`);
console.log(`Server -> ${server.url}`);
console.log(
	"ThinkspaceAgent Durable Object binding intentionally deferred until the runtime seam exists.",
);

await app.finalize();
