import { defineConfig } from "drizzle-kit";

export default defineConfig({
	dialect: "sqlite",
	driver: "durable-sqlite",
	schema: "./src/adapters/do/schema/chat.ts",
	out: "./src/adapters/do/migrations",
});
