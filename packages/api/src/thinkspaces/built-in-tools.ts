/**
 * The built-in read tool catalog.
 *
 * Built-ins are a first-class tool source in the existing enablement scheme:
 * an Agent Profile revision makes one present with a stable tool id, and a
 * Thinkspace-owned Permission of the matching kind makes it potent. Web
 * search and web fetch share one Permission kind (web reading); Source
 * reading has its own, so the user can let the agent read their material
 * without letting it touch the public web, and vice versa (PRD #73).
 */
import { THINKSPACE_PERMISSION_KINDS } from "@better-agent/db/schema/permissions";

import type { BuiltInToolAccessPermissionRequest } from "./agent-profile";

export const BUILT_IN_TOOL_IDS = ["web_search", "web_fetch", "source_read"] as const;

export type BuiltInToolId = (typeof BUILT_IN_TOOL_IDS)[number];

export const isBuiltInToolId = (value: string): value is BuiltInToolId =>
	BUILT_IN_TOOL_IDS.includes(value as BuiltInToolId);

export type BuiltInToolPermissionKind =
	| typeof THINKSPACE_PERMISSION_KINDS.BUILT_IN_SOURCE_READ
	| typeof THINKSPACE_PERMISSION_KINDS.BUILT_IN_WEB_READ;

/**
 * Which Permission kind governs each built-in tool. Unknown tool ids map to
 * nothing, so callers fail closed on ids this catalog does not know.
 */
export const builtInToolPermissionKind = (toolId: string): BuiltInToolPermissionKind | null => {
	if (toolId === "web_search" || toolId === "web_fetch") {
		return THINKSPACE_PERMISSION_KINDS.BUILT_IN_WEB_READ;
	}

	if (toolId === "source_read") {
		return THINKSPACE_PERMISSION_KINDS.BUILT_IN_SOURCE_READ;
	}

	return null;
};

const BUILT_IN_PERMISSION_REASONS: Record<BuiltInToolPermissionKind, string> = {
	[THINKSPACE_PERMISSION_KINDS.BUILT_IN_SOURCE_READ]:
		"Allow this Thinkspace Agent to read this Thinkspace's Sources.",
	[THINKSPACE_PERMISSION_KINDS.BUILT_IN_WEB_READ]:
		"Allow this Thinkspace Agent to search and read the public web.",
};

/**
 * One Permission request per governing kind, however many of its tools are
 * enabled — enabling both web tools yields a single web reading request.
 */
export const createBuiltInToolPermissionRequests = (
	toolIds: readonly BuiltInToolId[],
): BuiltInToolAccessPermissionRequest[] => {
	const kinds = new Set<BuiltInToolPermissionKind>();

	for (const toolId of toolIds) {
		const kind = builtInToolPermissionKind(toolId);

		if (kind) {
			kinds.add(kind);
		}
	}

	return [...kinds].map((kind) => ({ kind, reason: BUILT_IN_PERMISSION_REASONS[kind] }));
};
