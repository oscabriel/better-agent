import alchemy from "alchemy";
import {
	D1Database,
	DurableObjectNamespace,
	KVNamespace,
	Vite,
	Worker,
} from "alchemy/cloudflare";
import { config } from "dotenv";

const app = await alchemy("better-chat");

const stage = app.stage;

config({ path: `./.env.${stage}` });
config({ path: `./apps/web/.env.${stage}` });
config({ path: `./apps/server/.env.${stage}` });

const db = await D1Database("database", {
	name: `${app.name}-db`,
	migrationsDir: "apps/server/src/infra/db/migrations",
	adopt: true,
	readReplication: { mode: "auto" },
});

const sessions = await KVNamespace("sessions", {
	title: `${app.name}-user-sessions`,
});

const userDO = DurableObjectNamespace("user-do", {
	className: "UserDurableObject",
	sqlite: true,
});

export const web = await Vite("web", {
	cwd: "apps/web",
	name: `${app.name}-site`,
	assets: "dist",
	bindings: {
		VITE_SERVER_URL: alchemy.env.VITE_SERVER_URL,
		VITE_WEB_URL: alchemy.env.VITE_WEB_URL,
	},
	dev: {
		command: "bun run dev",
	},
	domains: [alchemy.env.CUSTOM_WEB_DOMAIN],
});

export const server = await Worker("server", {
	cwd: "apps/server",
	name: `${app.name}-api`,
	entrypoint: "src/index.ts",
	compatibility: "node",
	bundle: {
		loader: {
			".sql": "text",
		},
	},
	observability: {
		enabled: true,
	},
	bindings: {
		DB: db,
		SESSION_KV: sessions,
		USER_DO: userDO,
		ALCHEMY_STAGE: alchemy.env.ALCHEMY_STAGE,
		CORS_ORIGIN: alchemy.env.CORS_ORIGIN,
		BETTER_AUTH_URL: alchemy.env.BETTER_AUTH_URL,
		BETTER_AUTH_SECRET: alchemy.secret.env.BETTER_AUTH_SECRET,
		RESEND_API_KEY: alchemy.secret.env.RESEND_API_KEY,
		GOOGLE_CLIENT_ID: alchemy.secret.env.GOOGLE_CLIENT_ID,
		GOOGLE_CLIENT_SECRET: alchemy.secret.env.GOOGLE_CLIENT_SECRET,
		GITHUB_CLIENT_ID: alchemy.secret.env.GITHUB_CLIENT_ID,
		GITHUB_CLIENT_SECRET: alchemy.secret.env.GITHUB_CLIENT_SECRET,
		API_ENCRYPTION_KEY: alchemy.secret.env.API_ENCRYPTION_KEY,
		OPENAI_API_KEY: alchemy.secret.env.OPENAI_API_KEY,
		GOOGLE_GENERATIVE_AI_API_KEY:
			alchemy.secret.env.GOOGLE_GENERATIVE_AI_API_KEY,
		OPENROUTER_API_KEY: alchemy.secret.env.OPENROUTER_API_KEY,
	},
	routes: [alchemy.env.API_ROUTE_PATTERN],
	dev: {
		port: 3000,
	},
});

if (stage === "prod") {
	console.log("\nDeployed via Alchemy:");
	console.log(`  Web    -> https://${alchemy.env.CUSTOM_WEB_DOMAIN}`);
	console.log(`  Server -> https://${alchemy.env.API_ROUTE_PATTERN}`);
}

await app.finalize();
