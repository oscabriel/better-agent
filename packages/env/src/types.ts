export interface CloudflareEnv {
	BETTER_AUTH_SECRET: string;
	BETTER_AUTH_URL: string;
	CORS_ORIGIN: string;
	DB: D1Database;
	THINKSPACE_AGENT: DurableObjectNamespace;
	SESSION_KV?: KVNamespace;
	SOURCES_ARTIFACTS?: R2Bucket;
	API_ENCRYPTION_KEY?: string;
	VITE_SERVER_URL?: string;
}
