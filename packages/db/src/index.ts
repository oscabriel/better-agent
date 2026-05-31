import { env } from "@better-agent/env/server";
import { drizzle } from "drizzle-orm/d1";
import type { DrizzleD1Database } from "drizzle-orm/d1";

import * as schema from "./schema";

export type ProductSchema = typeof schema;
export type ProductDb = DrizzleD1Database<ProductSchema>;

export const createDb = (binding: D1Database = env.DB): ProductDb => drizzle(binding, { schema });

export { schema };
