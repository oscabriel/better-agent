import { createServerFn } from "@tanstack/react-start";

import { authMiddleware } from "@/middleware/auth";

export const getUser = createServerFn({ method: "GET" })
	.middleware([authMiddleware])
	.handler(({ context }) => context.session);
