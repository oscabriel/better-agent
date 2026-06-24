import type { CloudflareEnv } from "@better-agent/env/types";

/**
 * Where a built-in authed MCP server's credential comes from. Built-in servers
 * have no per-user secret store, so an `api_key_header`/`bearer` built-in is
 * backed by a product-level secret on the worker env, injected as a named
 * transport header at connect time. Registered connections resolve their own
 * credential from their stored encrypted headers instead, so they never appear
 * here.
 *
 * `context7` is the only built-in needing auth today; its remote MCP server
 * authenticates with the API key in a `CONTEXT7_API_KEY` header.
 */
const BUILT_IN_MCP_CREDENTIAL_SOURCES: Record<
	string,
	{ envKey: keyof CloudflareEnv; header: string }
> = {
	context7: { envKey: "CONTEXT7_API_KEY", header: "CONTEXT7_API_KEY" },
};

const readEnvSecret = (env: CloudflareEnv, key: keyof CloudflareEnv): string | undefined => {
	const value = env[key];

	return typeof value === "string" && value.length > 0 ? value : undefined;
};

/**
 * The built-in authed MCP server ids the deploy actually has a product key for.
 * Fed into the permission policy's credential-exists axis so a built-in authed
 * server stays inert when its key is unconfigured, exactly as it fails closed
 * at connect time.
 */
export const credentialedBuiltInMcpServerIds = (env: CloudflareEnv): ReadonlySet<string> => {
	const ids = new Set<string>();

	for (const [serverId, source] of Object.entries(BUILT_IN_MCP_CREDENTIAL_SOURCES)) {
		if (readEnvSecret(env, source.envKey)) {
			ids.add(serverId);
		}
	}

	return ids;
};

/**
 * The auth headers for a built-in server, or null when the server is not a
 * known built-in authed server or its product key is unconfigured. Returning
 * null lets the caller fall through to a registered connection's stored headers
 * (or fail closed for an authed server with no resolvable credential).
 */
export const resolveBuiltInMcpHeaders = (
	serverId: string,
	env: CloudflareEnv,
): Record<string, string> | null => {
	const source = BUILT_IN_MCP_CREDENTIAL_SOURCES[serverId];
	if (!source) {
		return null;
	}

	const secret = readEnvSecret(env, source.envKey);

	return secret ? { [source.header]: secret } : null;
};
