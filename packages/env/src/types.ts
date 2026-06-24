export interface CloudflareEnv {
	BETTER_AUTH_SECRET: string;
	BETTER_AUTH_URL: string;
	CORS_ORIGIN: string;
	CURATOR_AGENT: DurableObjectNamespace;
	DB: D1Database;
	THINKSPACE_AGENT: DurableObjectNamespace;
	SESSION_KV?: KVNamespace;
	MODEL_CATALOG_KV?: KVNamespace;
	SOURCES_ARTIFACTS?: R2Bucket;
	API_ENCRYPTION_KEY?: string;
	/**
	 * Product-level API key for the built-in Context7 MCP server (an
	 * `api_key_header` server with no per-user credential store). When set, a
	 * Thinkspace granted Context7 connects with this key injected as its auth
	 * header; when unset, Context7 stays inert and fails closed. Registered MCP
	 * connections carry their own per-user encrypted headers instead.
	 */
	CONTEXT7_API_KEY?: string;
	VITE_SERVER_URL?: string;
}
