import { ORPCError, os } from "@orpc/server";
import type { Context } from "./context";

const o = os.$context<Context>();

export const publicProcedure = o;

type ProtectedContext = Context & {
	session: NonNullable<Context["session"]>;
};

export const protectedProcedure = publicProcedure.use(({ context, next }) => {
	if (!context.session) {
		throw new ORPCError("UNAUTHORIZED", {
			message: "Authentication required",
			cause: "No session",
		});
	}
	return next({
		context: {
			...context,
			session: context.session,
		} as ProtectedContext,
	});
});

export type { ProtectedContext };
