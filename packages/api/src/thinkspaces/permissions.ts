import type { ProductDb } from "@better-agent/db";
import {
	THINKSPACE_PERMISSION_KINDS,
	thinkspacePermissions,
} from "@better-agent/db/schema/permissions";
import type {
	NewThinkspacePermission,
	ThinkspacePermission,
} from "@better-agent/db/schema/permissions";
import { and, eq } from "drizzle-orm";

import { MODEL_PROVIDER_IDS } from "../models/catalog";
import type { ModelProviderId } from "../models/catalog";
import { listBuiltInMcpServers } from "../mcp/catalog";
import type { GrantableMcpServer } from "../mcp/grantable-servers";
import { assertSafeMcpServerUrl } from "../mcp/url-policy";
import type {
	BuiltInToolAccessPermissionRequest,
	McpToolAccessPermissionRequest,
	RequestedPermission,
} from "./agent-profile";

export interface GrantThinkspacePermissionInput {
	grantedByUserId: string;
	permission: RequestedPermission;
	thinkspaceId: string;
}

export interface ThinkspacePermissionGrantOptions {
	allowInsecureDevUrls?: boolean;
	/**
	 * The MCP servers this owner may be granted: built-in catalog entries plus
	 * their registered connections (see `mcp/grantable-servers.ts`). Defaults to
	 * the built-in catalog alone when a caller does not resolve the owner's
	 * registry.
	 */
	grantableMcpServers?: GrantableMcpServer[];
}

export interface RevokeThinkspacePermissionInput {
	permissionId: string;
	thinkspaceId: string;
}

export class ThinkspacePermissionGrantError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "ThinkspacePermissionGrantError";
	}
}

const MODEL_PROVIDER_SCOPE = JSON.stringify({ type: "model_provider" });

/**
 * The repo-allowlist `resourceScope` is reserved but not enforced this slice
 * (it pairs with the deferred standing-approval policy, ADR-0003); the grant
 * just records its type for now.
 */
const CONNECTED_ACCOUNT_CREDENTIAL_SCOPE = JSON.stringify({
	type: "connected_account_credential",
});

/**
 * Grant rows live on the (thinkspaceId, kind, providerId) unique index, so
 * each built-in kind gets a stable resource identity: the web for web
 * reading, this Thinkspace's Sources for Source reading, this Thinkspace's
 * Memory for held Memory writing.
 */
const BUILT_IN_GRANT_PROVIDER_IDS = {
	built_in_memory_write: "memory",
	built_in_source_read: "sources",
	built_in_web_read: "web",
} as const satisfies Record<BuiltInToolAccessPermissionRequest["kind"], string>;

const BUILT_IN_GRANT_SCOPES = {
	built_in_memory_write: JSON.stringify({ type: "memory_write" }),
	built_in_source_read: JSON.stringify({ type: "source_read" }),
	built_in_web_read: JSON.stringify({ type: "web_read" }),
} as const satisfies Record<BuiltInToolAccessPermissionRequest["kind"], string>;

const isBuiltInToolPermissionRequest = (
	permission: RequestedPermission,
): permission is BuiltInToolAccessPermissionRequest =>
	permission.kind === THINKSPACE_PERMISSION_KINDS.BUILT_IN_MEMORY_WRITE ||
	permission.kind === THINKSPACE_PERMISSION_KINDS.BUILT_IN_SOURCE_READ ||
	permission.kind === THINKSPACE_PERMISSION_KINDS.BUILT_IN_WEB_READ;

const isModelProviderId = (value: string): value is ModelProviderId =>
	MODEL_PROVIDER_IDS.includes(value as ModelProviderId);

const createPermissionId = (): string => `thinkspace_permission_${crypto.randomUUID()}`;

const findGrantableMcpServer = (
	serverId: string,
	options: ThinkspacePermissionGrantOptions,
): GrantableMcpServer | null => {
	const catalog = options.grantableMcpServers ?? listBuiltInMcpServers();

	return catalog.find((server) => server.id === serverId) ?? null;
};

const assertGrantableMcpToolAccess = (
	permission: McpToolAccessPermissionRequest,
	options: ThinkspacePermissionGrantOptions,
): GrantableMcpServer => {
	const server = findGrantableMcpServer(permission.serverId, options);

	if (!server) {
		throw new ThinkspacePermissionGrantError(
			"That MCP server is not a built-in or one you have registered, so it cannot be granted to a Thinkspace.",
		);
	}

	// Authenticated MCP access is grantable: like the model-provider and
	// connected-account grants, the grant records the capability on one axis
	// while the credential lives on another. A granted authed server connects
	// only when its credential is resolvable — registered connections carry
	// encrypted headers, built-in authed servers read a product key — and the
	// credential-exists potency axis flips the tool inert (and the runtime fails
	// closed) when no credential backs it (ADR-0009).

	// Mutating and unknown-risk MCP access is grantable: a non-read-only server's
	// tool calls are held for the owner's Approval at runtime rather than executed
	// on the grant alone (ADR-0003), so the grant records the capability and the
	// holdpoint enforces consent.

	try {
		assertSafeMcpServerUrl(server.url, options.allowInsecureDevUrls ?? false);
	} catch {
		throw new ThinkspacePermissionGrantError("MCP server URL policy rejected this grant.");
	}

	return server;
};

const serializeMcpToolAccessScope = (permission: McpToolAccessPermissionRequest): string =>
	JSON.stringify(permission.scope);

export const toThinkspacePermissionGrant = (
	{ grantedByUserId, permission, thinkspaceId }: GrantThinkspacePermissionInput,
	options: ThinkspacePermissionGrantOptions = {},
): NewThinkspacePermission | null => {
	if (permission.kind === "model_provider_credential") {
		if (!isModelProviderId(permission.providerId)) {
			return null;
		}

		return {
			grantedByUserId,
			id: createPermissionId(),
			kind: THINKSPACE_PERMISSION_KINDS.MODEL_PROVIDER_CREDENTIAL,
			providerId: permission.providerId,
			reason: permission.reason,
			resourceScope: MODEL_PROVIDER_SCOPE,
			thinkspaceId,
		};
	}

	if (isBuiltInToolPermissionRequest(permission)) {
		return {
			grantedByUserId,
			id: createPermissionId(),
			kind: permission.kind,
			providerId: BUILT_IN_GRANT_PROVIDER_IDS[permission.kind],
			reason: permission.reason,
			resourceScope: BUILT_IN_GRANT_SCOPES[permission.kind],
			thinkspaceId,
		};
	}

	if (permission.kind === THINKSPACE_PERMISSION_KINDS.CONNECTED_ACCOUNT_CREDENTIAL) {
		return {
			grantedByUserId,
			id: createPermissionId(),
			kind: THINKSPACE_PERMISSION_KINDS.CONNECTED_ACCOUNT_CREDENTIAL,
			providerId: permission.catalogId,
			reason: permission.reason,
			resourceScope: CONNECTED_ACCOUNT_CREDENTIAL_SCOPE,
			thinkspaceId,
		};
	}

	assertGrantableMcpToolAccess(permission, options);

	return {
		grantedByUserId,
		id: createPermissionId(),
		kind: THINKSPACE_PERMISSION_KINDS.MCP_TOOL_ACCESS,
		providerId: permission.serverId,
		reason: permission.reason,
		resourceScope: serializeMcpToolAccessScope(permission),
		thinkspaceId,
	};
};

export const prepareThinkspacePermissionGrants = (
	inputs: GrantThinkspacePermissionInput[],
	options: ThinkspacePermissionGrantOptions = {},
): NewThinkspacePermission[] =>
	inputs
		.map((input) => toThinkspacePermissionGrant(input, options))
		.filter((grant): grant is NewThinkspacePermission => grant !== null);

export const saveThinkspacePermissionGrants = async (
	db: ProductDb,
	grants: NewThinkspacePermission[],
): Promise<ThinkspacePermission[]> => {
	if (grants.length === 0) {
		return [];
	}

	const saved = await Promise.all(
		grants.map(async (grant) => {
			const [row] = await db
				.insert(thinkspacePermissions)
				.values(grant)
				.onConflictDoUpdate({
					set: {
						grantedByUserId: grant.grantedByUserId,
						reason: grant.reason,
						resourceScope: grant.resourceScope,
					},
					target: [
						thinkspacePermissions.thinkspaceId,
						thinkspacePermissions.kind,
						thinkspacePermissions.providerId,
					],
				})
				.returning();

			if (!row) {
				throw new Error("Thinkspace Permission grant was not persisted.");
			}

			return row;
		}),
	);

	return saved;
};

export const grantThinkspacePermissions = async (
	db: ProductDb,
	inputs: GrantThinkspacePermissionInput[],
	options: ThinkspacePermissionGrantOptions = {},
): Promise<ThinkspacePermission[]> =>
	await saveThinkspacePermissionGrants(db, prepareThinkspacePermissionGrants(inputs, options));

export const hasThinkspaceModelProviderCredentialPermission = async (
	db: ProductDb,
	input: { providerId: ModelProviderId; thinkspaceId: string },
): Promise<boolean> => {
	const [permission] = await db
		.select({ id: thinkspacePermissions.id })
		.from(thinkspacePermissions)
		.where(
			and(
				eq(thinkspacePermissions.thinkspaceId, input.thinkspaceId),
				eq(thinkspacePermissions.kind, THINKSPACE_PERMISSION_KINDS.MODEL_PROVIDER_CREDENTIAL),
				eq(thinkspacePermissions.providerId, input.providerId),
			),
		)
		.limit(1);

	return Boolean(permission);
};

export const listThinkspacePermissions = async (
	db: ProductDb,
	input: { thinkspaceId: string },
): Promise<ThinkspacePermission[]> =>
	await db
		.select()
		.from(thinkspacePermissions)
		.where(eq(thinkspacePermissions.thinkspaceId, input.thinkspaceId));

export const revokeThinkspacePermission = async (
	db: ProductDb,
	input: RevokeThinkspacePermissionInput,
): Promise<ThinkspacePermission | null> => {
	const [revoked] = await db
		.delete(thinkspacePermissions)
		.where(
			and(
				eq(thinkspacePermissions.id, input.permissionId),
				eq(thinkspacePermissions.thinkspaceId, input.thinkspaceId),
			),
		)
		.returning();

	return revoked ?? null;
};
