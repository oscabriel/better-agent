import { sql } from "drizzle-orm";

export const timestampMsNow = sql`(cast(unixepoch('subsecond') * 1000 as integer))`;
