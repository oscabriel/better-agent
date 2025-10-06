import type { Context as HonoContext } from "hono";
import { auth } from "@/server/infra/auth";
import { getUserDOStub } from "@/server/infra/do/user-do-helper";

export class UnauthorizedError extends Error {
	constructor(message = "Authentication required") {
		super(message);
		this.name = "UnauthorizedError";
	}
}

/**
 * Ensures the request has a valid session and returns the per-user DO stub.
 * Centralizes the trust boundary: only a verified session can obtain a stub,
 * and the stub is always derived from the session's user id (never input).
 */
export async function requireUserDO(c: HonoContext) {
	const session = await auth.api.getSession({ headers: c.req.raw.headers });
	if (!session) throw new UnauthorizedError();

	const stub = getUserDOStub(c.env, session.user.id);
	return { userId: session.user.id, stub } as const;
}

export async function requireUserId(c: HonoContext) {
	const session = await auth.api.getSession({ headers: c.req.raw.headers });
	if (!session) throw new UnauthorizedError();
	return session.user.id;
}
