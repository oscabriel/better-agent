import { defineConfig } from "drizzle-kit";
import { getLocalD1Path } from "./src/db/d1/local-db-path";

const IS_DEV = process.env.DB_STAGE === "dev";

export default defineConfig({
	dialect: "sqlite",
	schema: "./src/db/d1/schema",
	out: "./src/db/d1/migrations",
	...(IS_DEV
		? {
				dbCredentials: {
					url: `file:${getLocalD1Path()}`,
				},
			}
		: {
				driver: "d1-http",
				dbCredentials: {
					accountId: process.env.CLOUDFLARE_ACCOUNT_ID || "",
					databaseId: process.env.CLOUDFLARE_DATABASE_ID || "",
					token: process.env.CLOUDFLARE_API_TOKEN || "",
				},
			}),
});
