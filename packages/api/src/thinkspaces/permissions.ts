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
import type { BuiltInMcpServer } from "../mcp/catalog";
import { assertSafeMcpServerUrl } from "../mcp/url-policy";
import type { McpToolAccessPermissionRequest, RequestedPermission } from "./agent-profile";

export interface GrantThinkspacePermissionInput {
	grantedByUserId: string;
	permission: RequestedPermission;
	thinkspaceId: string;
}

export interface ThinkspacePermissionGrantOptions {
	allowInsecureDevUrls?: boolean;
	builtInMcpServers?: BuiltInMcpServer[];
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

const isModelProviderId = (value: string): value is ModelProviderId =>
	MODEL_PROVIDER_IDS.includes(value as ModelProviderId);

const createPermissionId = (): string => `thinkspace_permission_${crypto.randomUUID()}`;

const findBuiltInMcpServer = (
	serverId: string,
	options: ThinkspacePermissionGrantOptions,
): BuiltInMcpServer | null => {
	const catalog = options.builtInMcpServers ?? listBuiltInMcpServers();

	return catalog.find((server) => server.id === serverId) ?? null;
};

const assertGrantableMcpToolAccess = (
	permission: McpToolAccessPermissionRequest,
	options: ThinkspacePermissionGrantOptions,
): BuiltInMcpServer => {
	const server = findBuiltInMcpServer(permission.serverId, options);

	if (!server) {
		throw new ThinkspacePermissionGrantError(
			"Only built-in MCP servers can be granted to a Thinkspace in this slice.",
		);
	}

	if (server.authType !== "none") {
		throw new ThinkspacePermissionGrantError(
			"MCP servers that require authentication are not grantable in this slice.",
		);
	}

	if (server.riskLevel !== "read_only" || permission.risk !== "read_only") {
		throw new ThinkspacePermissionGrantError(
			"Only read-only MCP tool access is grantable in this slice.",
		);
	}

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
