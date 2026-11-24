import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema.js";

export function connect(url: string) {
  return drizzle(new pg.Pool({ connectionString: url }), { schema });
}
