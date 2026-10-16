import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";
import { sql } from "drizzle-orm";

export function createDb(url: string) {
    const client = postgres(url);
    const db = drizzle(client, { schema });
    return { db, close: () => client.end() };
}

export type Db = ReturnType<typeof createDb>["db"];

/** Fails fast at startup when the database is unreachable (wrong URL, container down) */
export async function pingDb(db: Db): Promise<void> {
    await db.execute(sql`SELECT 1`);
}
