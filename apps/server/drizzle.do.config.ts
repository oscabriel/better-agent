import { defineConfig } from "drizzle-kit";

export default defineConfig({
	dialect: "sqlite",
	driver: "durable-sqlite",
	schema: "./src/db/do/schema/chat.ts",
	out: "./src/db/do/migrations",
});
