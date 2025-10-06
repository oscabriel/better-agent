import { defineConfig } from "drizzle-kit";

export default defineConfig({
	dialect: "sqlite",
	driver: "durable-sqlite",
	schema: "./src/infra/do/schema/chat.ts",
	out: "./src/infra/do/migrations",
});
