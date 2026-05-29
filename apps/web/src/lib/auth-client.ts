import { env } from "@better-agent/env/web";
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
	basePath: "/api/auth",
	baseURL: env.VITE_SERVER_URL,
});
