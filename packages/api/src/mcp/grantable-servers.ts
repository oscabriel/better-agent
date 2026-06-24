/**
 * The set of MCP servers a Thinkspace may be granted access to at activation.
 *
 * The Thinkspace permission grant path (`thinkspaces/permissions.ts`) used to
 * recognize only the hardcoded built-in catalog, so a user's own registered
 * MCP servers could be *proposed* by the Curator but never *granted* — they
 * tripped the "Only built-in MCP servers can be granted" guard. This module is
 * the seam that unifies the two: built-in catalog entries plus the owner's
 * registered connections, expressed in one shape the grant guards understand.
 *
 * A registered connection is still subject to the remaining grant guards: it is
 * grantable now only if it declares `authType: "none"` and `riskLevel:
 * "read_only"`. Authenticated servers wait on the credential seam (ADR-0009);
 * mutating servers wait on the draft-or-approval policy (ADR-0003).
 */
import type { ProductDb } from "@better-agent/db";
import type { UserMcpConnection } from "@better-agent/db/schema/settings";

import { listBuiltInMcpServers } from "./catalog";
import type { BuiltInMcpServer, McpAuthType, McpRiskLevel, McpTransport } from "./catalog";
import { listCustomMcpConnections } from "./repository";

/**
 * The shape every grant-path guard reads. A registered user connection and a
 * built-in catalog entry both project onto it, so the guards never branch on
 * where a server came from. Structurally identical to `BuiltInMcpServer`; named
 * for the role it plays at the grant boundary.
 */
export type GrantableMcpServer = BuiltInMcpServer;

const AUTH_TYPES = new Set<string>(["none", "bearer", "api_key_header"]);
const RISK_LEVELS = new Set<string>(["read_only", "unknown", "mutating"]);
const TRANSPORTS = new Set<string>(["streamable_http", "sse"]);

const coerceAuthType = (value: string): McpAuthType =>
	AUTH_TYPES.has(value) ? (value as McpAuthType) : "bearer";

const coerceRiskLevel = (value: string): McpRiskLevel =>
	RISK_LEVELS.has(value) ? (value as McpRiskLevel) : "unknown";

const coerceTransport = (value: string): McpTransport =>
	TRANSPORTS.has(value) ? (value as McpTransport) : "streamable_http";

/**
 * Projects a registered connection onto the grantable shape. Auth is resolved
 * defensively: a connection that carries stored secret headers is treated as
 * authenticated even if its declared `authType` is "none", so a header-bearing
 * server can never slip past the no-credential grant guard.
 */
export const userMcpConnectionToGrantableServer = (
	connection: UserMcpConnection,
): GrantableMcpServer => {
	const declaredAuthType = coerceAuthType(connection.authType);
	const carriesSecretHeaders = connection.encryptedHeaders !== "{}";
	const authType =
		declaredAuthType === "none" && carriesSecretHeaders ? "bearer" : declaredAuthType;

	return {
		authType,
		description: connection.description ?? "",
		enabledByDefaultForThinkspaces: false,
		id: connection.id,
		name: connection.name,
		riskLevel: coerceRiskLevel(connection.riskLevel),
		transport: coerceTransport(connection.transport),
		url: connection.url,
	};
};

/**
 * The grantable catalog for one owner: built-in servers plus their registered
 * connections. Built-ins come first; on an id collision the built-in wins,
 * since a user cannot redefine a curated server.
 */
export const listGrantableMcpServers = async (
	db: ProductDb,
	userId: string,
): Promise<GrantableMcpServer[]> => {
	const builtIn = listBuiltInMcpServers();
	const builtInIds = new Set(builtIn.map((server) => server.id));
	const connections = await listCustomMcpConnections(db, userId);

	return [
		...builtIn,
		...connections
			.filter((connection) => !builtInIds.has(connection.id))
			.map(userMcpConnectionToGrantableServer),
	];
};
