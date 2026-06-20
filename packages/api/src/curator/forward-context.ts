/**
 * The Curator's creation runtime is a deliberate parallel of the Sitting
 * transport (`thinkspaces/sittings.ts`): the same one-narrow-opening contract,
 * for a different role. A **Sitting** is owner ↔ Thinkspace Agent over an active
 * Thinkspace; Curator-led creation is owner ↔ Curator over a *draft* Thinkspace,
 * before any Thinkspace Agent exists. This module owns how the worker stamps an
 * authenticated forward onto a curation request, and how the `CuratorAgent`
 * runtime verifies it before admitting the request into Project Think's chat
 * protocol. The runtime stays fail-closed (404) to everything else.
 */

/** Path prefix for the single authenticated curation route the worker exposes. */
export const CURATION_ROUTE_PREFIX = "/api/curator/" as const;

/**
 * Header the worker attaches to a forwarded curation request after it has
 * verified the session and draft ownership. The runtime treats this as the
 * authority for who is connecting, because the Durable Object is only reachable
 * through the worker binding. The worker strips any client-supplied value before
 * stamping its own, so a browser can never smuggle this header through.
 */
export const CURATION_FORWARD_CONTEXT_HEADER = "x-better-agent-curation-forward" as const;

/** DO storage key for the (owner, draft) pair this runtime is bound to. */
export const CURATION_CONTEXT_STORAGE_KEY = "better-agent:curation-context" as const;

/**
 * The owner/draft pair the worker authenticated for a forwarded curation
 * request. Keyed on the *draft Thinkspace id* — one Curator per draft — which
 * survives activation so a future reconfiguration slice can re-enter the same
 * runtime.
 */
export interface CurationForwardContext {
	draftThinkspaceId: string;
	ownerUserId: string;
}

/**
 * Pulls the draft Thinkspace id out of a curation route pathname. Returns null
 * when the path is not a curation route or carries no id, so callers fail closed.
 *
 * Examples:
 * - `/api/curator/thinkspace_123` → `"thinkspace_123"`
 * - `/api/curator/thinkspace_123/get-messages` → `"thinkspace_123"`
 * - `/api/curator/` → `null`
 */
export const parseCurationDraftThinkspaceId = (pathname: string): string | null => {
	if (!pathname.startsWith(CURATION_ROUTE_PREFIX)) {
		return null;
	}

	const remainder = pathname.slice(CURATION_ROUTE_PREFIX.length);
	const [segment] = remainder.split("/", 1);

	if (!segment) {
		return null;
	}

	let decodedSegment: string;
	try {
		decodedSegment = decodeURIComponent(segment);
	} catch {
		// A malformed percent-escape must fail closed to the worker's sealed 404,
		// not let a URIError escape to a 500 that would distinguish a bad-id probe
		// from a clean miss.
		return null;
	}

	const draftThinkspaceId = decodedSegment.trim();

	return draftThinkspaceId.length > 0 ? draftThinkspaceId : null;
};

/**
 * Encodes an authenticated forward context into a header-safe value. The value
 * is opaque to the client and only meaningful to the runtime, which re-verifies
 * it against the context the Durable Object is bound to.
 */
export const encodeCurationForwardContext = (context: CurationForwardContext): string =>
	encodeURIComponent(
		JSON.stringify({
			draftThinkspaceId: context.draftThinkspaceId,
			ownerUserId: context.ownerUserId,
		}),
	);

/**
 * Decodes a forward context header value, returning null on any malformed,
 * missing, or wrong-shaped input so the runtime fails closed.
 */
export const decodeCurationForwardContext = (
	value: string | null | undefined,
): CurationForwardContext | null => {
	if (!value) {
		return null;
	}

	try {
		const parsed = JSON.parse(decodeURIComponent(value)) as unknown;

		if (typeof parsed !== "object" || parsed === null) {
			return null;
		}

		const { draftThinkspaceId, ownerUserId } = parsed as Record<string, unknown>;

		if (typeof draftThinkspaceId !== "string" || typeof ownerUserId !== "string") {
			return null;
		}

		const boundedDraft = draftThinkspaceId.trim();
		const boundedOwner = ownerUserId.trim();

		if (!boundedDraft || !boundedOwner) {
			return null;
		}

		return { draftThinkspaceId: boundedDraft, ownerUserId: boundedOwner };
	} catch {
		return null;
	}
};

/**
 * Fail-closed admission check: a decoded forward context only matches when both
 * the owner and the draft Thinkspace agree with what the runtime expects. A
 * missing context matches nothing.
 */
export const matchesCurationForwardContext = (
	context: CurationForwardContext | null,
	expected: CurationForwardContext,
): boolean =>
	context !== null &&
	context.ownerUserId === expected.ownerUserId &&
	context.draftThinkspaceId === expected.draftThinkspaceId;
