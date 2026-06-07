export interface CloudflareEnv {
	BETTER_AUTH_SECRET: string;
	BETTER_AUTH_URL: string;
	CORS_ORIGIN: string;
	DB: D1Database;
	SESSION_KV?: KVNamespace;
	SOURCES_ARTIFACTS?: R2Bucket;
	API_ENCRYPTION_KEY?: string;
	GOOGLE_GENERATIVE_AI_API_KEY?: string;
	OPENAI_API_KEY?: string;
	ANTHROPIC_API_KEY?: string;
	VITE_SERVER_URL?: string;
}
