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
import type { RequestedPermission } from "./agent-profile";

export interface GrantThinkspacePermissionInput {
	grantedByUserId: string;
	permission: RequestedPermission;
	thinkspaceId: string;
}

const isModelProviderId = (value: string): value is ModelProviderId =>
	MODEL_PROVIDER_IDS.includes(value as ModelProviderId);

const createPermissionId = (): string => `thinkspace_permission_${crypto.randomUUID()}`;

export const toThinkspacePermissionGrant = ({
	grantedByUserId,
	permission,
	thinkspaceId,
}: GrantThinkspacePermissionInput): NewThinkspacePermission | null => {
	if (!("kind" in permission) || permission.kind !== "model_provider_credential") {
		return null;
	}

	if (!isModelProviderId(permission.providerId)) {
		return null;
	}

	return {
		grantedByUserId,
		id: createPermissionId(),
		kind: THINKSPACE_PERMISSION_KINDS.MODEL_PROVIDER_CREDENTIAL,
		providerId: permission.providerId,
		reason: permission.reason,
		thinkspaceId,
	};
};

export const grantThinkspacePermissions = async (
	db: ProductDb,
	inputs: GrantThinkspacePermissionInput[],
): Promise<ThinkspacePermission[]> => {
	const grants = inputs
		.map(toThinkspacePermissionGrant)
		.filter((grant): grant is NewThinkspacePermission => grant !== null);

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
