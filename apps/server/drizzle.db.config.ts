import { defineConfig } from "drizzle-kit";
import { getLocalD1Path } from "./src/infra/db/local-db-path";

const IS_DEV = process.env.DB_STAGE === "dev";

export default defineConfig({
	dialect: "sqlite",
	schema: "./src/infra/db/schema",
	out: "./src/infra/db/migrations",
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
