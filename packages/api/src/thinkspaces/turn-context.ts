import { markThinkspaceTurnProductSafeError } from "./inspect";

/**
 * The Thinkspace context a Thinkspace Agent runtime instance is bound to.
 * Runtime identity is the Thinkspace id, so one Durable Object instance must
 * only ever hold work for one Thinkspace. The worker's owner gate is the
 * authority; this context is defense-in-depth at the runtime boundary.
 */
export interface ThinkspaceTurnRuntimeContext {
	ownerUserId: string;
	thinkspaceId: string;
}

const RUNTIME_CONTEXT_MISMATCH_MESSAGE =
	"This Thinkspace Agent runtime cannot accept work for a different Thinkspace.";

/**
 * Binds (or re-binds) a runtime instance to its Thinkspace context. A runtime
 * already bound to one Thinkspace fails closed when asked to accept work for
 * another, with a product-safe marked error so no identifiers leak.
 */
export const bindThinkspaceTurnRuntimeContext = ({
	existing,
	request,
}: {
	existing?: ThinkspaceTurnRuntimeContext;
	request: ThinkspaceTurnRuntimeContext;
}): ThinkspaceTurnRuntimeContext => {
	if (existing && existing.thinkspaceId !== request.thinkspaceId) {
		throw new Error(markThinkspaceTurnProductSafeError(RUNTIME_CONTEXT_MISMATCH_MESSAGE));
	}

	return { ownerUserId: request.ownerUserId, thinkspaceId: request.thinkspaceId };
};

/**
 * Fail-closed inspection guard: a stored runtime context only matches the
 * Thinkspace it was bound to. A runtime with no bound context matches nothing.
 */
export const matchesThinkspaceTurnRuntimeContext = (
	context: ThinkspaceTurnRuntimeContext | undefined,
	thinkspaceId: string,
): boolean => context?.thinkspaceId === thinkspaceId;
