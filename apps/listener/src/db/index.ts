import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import * as schema from "./schema.js";

export type Db = ReturnType<typeof connect>;

export function connect(url: string) {
  return drizzle(new pg.Pool({ connectionString: url }), { schema });
}

/** Applies the checked-in Drizzle migrations (see `db:generate`). */
export async function runMigrations(db: Db) {
  await migrate(db, {
    migrationsFolder: fileURLToPath(new URL("../../drizzle", import.meta.url)),
  });
}
