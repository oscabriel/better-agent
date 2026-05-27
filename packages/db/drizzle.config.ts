import dotenv from "dotenv";
import { defineConfig } from "drizzle-kit";

dotenv.config({
	path: "../../apps/server/.env",
});

export default defineConfig({
	dialect: "sqlite",
	driver: "d1-http",
	out: "./src/migrations",
	schema: "./src/schema",
});
