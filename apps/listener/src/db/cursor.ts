import { eq } from "drizzle-orm";
import type { Db } from "./index.js";
import { cursor } from "./schema.js";

export async function loadCursor(db: Db, contractId: string): Promise<number | null> {
  const [row] = await db.select().from(cursor).where(eq(cursor.contractId, contractId));
  return row?.ledger ?? null;
}

export async function saveCursor(db: Db, contractId: string, ledger: number): Promise<void> {
  await db
    .insert(cursor)
    .values({ contractId, ledger })
    .onConflictDoUpdate({ target: cursor.contractId, set: { ledger, updatedAt: new Date() } });
}
