import type { ActiveAgentProfileRevision } from "./agent-profile";

/**
 * A **Sitting** is a live, streamed, back-and-forth session between a Thinkspace
 * owner and their Thinkspace Agent, on top of the agent's full durable history.
 *
 * A Sitting changes *who may knock on the runtime's door*, never *what the agent
 * may do*: every Sitting turn flows through the exact same per-turn governance
 * (active Agent Profile revision, model resolution, enabled ∩ potent tools,
 * per-call Permission rechecks) as a submitted turn. The worker authenticates
 * the session and verifies Thinkspace ownership before any traffic reaches the
 * runtime; the runtime stays fail-closed (404) to everything else.
 *
 * This module owns the worker↔runtime contract for that one narrow opening: how
 * the worker stamps an authenticated forward onto a request, and how the runtime
 * verifies it before admitting the request into Project Think's chat protocol.
 */

/** Path prefix for the single authenticated Sitting route the worker exposes. */
export const SITTING_ROUTE_PREFIX = "/api/sittings/" as const;

/**
 * Header the worker attaches to a forwarded Sitting request after it has
 * verified the session and Thinkspace ownership. The runtime treats this as the
 * authority for who is connecting, because the Durable Object is only reachable
 * through the worker binding. The worker strips any client-supplied value before
 * stamping its own, so a browser can never smuggle this header through.
 */
export const SITTING_FORWARD_CONTEXT_HEADER = "x-better-agent-sitting-forward" as const;

/**
 * The owner/Thinkspace pair the worker authenticated for a forwarded Sitting
 * request. Mirrors {@link ThinkspaceTurnRuntimeContext}; kept separate so the
 * transport contract can evolve without touching the stored runtime context.
 */
export interface SittingForwardContext {
	ownerUserId: string;
	thinkspaceId: string;
}

/**
 * Pulls the Thinkspace id out of a Sitting route pathname. Returns null when the
 * path is not a Sitting route or carries no id, so callers fail closed.
 *
 * Examples:
 * - `/api/sittings/thinkspace_123` → `"thinkspace_123"`
 * - `/api/sittings/thinkspace_123/get-messages` → `"thinkspace_123"`
 * - `/api/sittings/` → `null`
 */
export const parseSittingThinkspaceId = (pathname: string): string | null => {
	if (!pathname.startsWith(SITTING_ROUTE_PREFIX)) {
		return null;
	}

	const remainder = pathname.slice(SITTING_ROUTE_PREFIX.length);
	const [segment] = remainder.split("/", 1);

	if (!segment) {
		return null;
	}

	const thinkspaceId = decodeURIComponent(segment).trim();

	return thinkspaceId.length > 0 ? thinkspaceId : null;
};

/**
 * Encodes an authenticated forward context into a header-safe value. The value
 * is opaque to the client and only meaningful to the runtime, which re-verifies
 * it against the context the Durable Object is bound to.
 */
export const encodeSittingForwardContext = (context: SittingForwardContext): string =>
	encodeURIComponent(
		JSON.stringify({ ownerUserId: context.ownerUserId, thinkspaceId: context.thinkspaceId }),
	);

/**
 * Decodes a forward context header value, returning null on any malformed,
 * missing, or wrong-shaped input so the runtime fails closed.
 */
export const decodeSittingForwardContext = (
	value: string | null | undefined,
): SittingForwardContext | null => {
	if (!value) {
		return null;
	}

	try {
		const parsed = JSON.parse(decodeURIComponent(value)) as unknown;

		if (typeof parsed !== "object" || parsed === null) {
			return null;
		}

		const { ownerUserId, thinkspaceId } = parsed as Record<string, unknown>;

		if (typeof ownerUserId !== "string" || typeof thinkspaceId !== "string") {
			return null;
		}

		const boundedOwner = ownerUserId.trim();
		const boundedThinkspace = thinkspaceId.trim();

		if (!boundedOwner || !boundedThinkspace) {
			return null;
		}

		return { ownerUserId: boundedOwner, thinkspaceId: boundedThinkspace };
	} catch {
		return null;
	}
};

/**
 * Fail-closed admission check: a decoded forward context only matches when both
 * the owner and the Thinkspace agree with what the runtime expects. A missing
 * context matches nothing.
 */
export const matchesSittingForwardContext = (
	context: SittingForwardContext | null,
	expected: SittingForwardContext,
): boolean =>
	context !== null &&
	context.ownerUserId === expected.ownerUserId &&
	context.thinkspaceId === expected.thinkspaceId;

/** DO storage key for the revision the most recent turn resolved against. */
export const SITTING_TURN_ATTRIBUTION_STORAGE_KEY = "better-agent:turn-attribution" as const;

/**
 * Attribution for a turn, recorded at resolution time from the active Agent
 * Profile revision. Sitting turns do not pass through the submission ledger, so
 * this is where their revision attribution is preserved for the future Audit
 * Trail; the activation-history guarantee (every turn is attributable to the
 * revision it ran under) holds regardless of entry path.
 */
export interface ThinkspaceTurnAttribution {
	profileRevisionId: string;
	profileVersion: number;
}

export const createThinkspaceTurnAttribution = (
	revision: Pick<ActiveAgentProfileRevision, "id" | "version">,
): ThinkspaceTurnAttribution => ({
	profileRevisionId: revision.id,
	profileVersion: revision.version,
});
