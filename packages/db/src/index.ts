import { env } from "@better-agent/env/server";
import { drizzle } from "drizzle-orm/d1";

import * as schema from "./schema";

export const createDb = (binding: D1Database = env.DB) => drizzle(binding, { schema });

export type ProductDb = ReturnType<typeof createDb>;
