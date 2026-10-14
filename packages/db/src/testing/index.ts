import * as path from "node:path";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { createDb, type Db } from "../client.js";

const repoRoot = path.resolve(import.meta.dirname, "../../../../");
const migrationsFolder = path.resolve(import.meta.dirname, "../../drizzle");

/** Reads TEST_DATABASE_URL (from the repo-root .env) — never the dev database. */
export function testDatabaseUrl(): string {
    if (!process.env.TEST_DATABASE_URL) {
        try {
            process.loadEnvFile(path.join(repoRoot, ".env"));
        } catch (err) {
            // No .env (e.g. CI) - rely on the real environment
        }
    }

    const url = process.env.TEST_DATABASE_URL;
    if (!url) throw new Error("TEST_DATABASE_URL environment variable is required");
    if (!new URL(url).pathname.endsWith("_test")) throw new Error(`Refusing to use a non-test database ${url}`);
    return url;
}

/** Creates the test database if needed and applies all migrations. Safe to call repeatedly. */
export async function prepareTestDatabase(url = testDatabaseUrl()): Promise<void> {
    const target = new URL(url);
    const dbName = target.pathname.slice(1);

    const adminUrl = new URL(url);
    adminUrl.pathname = "/postgres";
    const admin = postgres(adminUrl.href, { max: 1, onnotice: () => {} });
    try {
        const existing = await admin`SELECT 1 FROM pg_database WHERE datname = ${dbName}`;
        if (existing.length === 0) await admin.unsafe(`CREATE DATABASE ${dbName}`);
    } finally {
        await admin.end();
    }

    const client = postgres(url, { max: 1, onnotice: () => {} });
    try {
        await migrate(drizzle(client), { migrationsFolder });
    } finally {
        await client.end();
    }
}

/** Fresh connection to the test DB. Call `close()` in afterAll. */
export function createTestDb() {
    return createDb(testDatabaseUrl());
}

/** Wipes all app tables (fast, keeps the schema). Run in beforeEach for isolated tests. */
export async function resetTestDb(db: Db): Promise<void> {
    await db.execute(sql`TRUNCATE storyboards, shots, jobs RESTART IDENTITY CASCADE`);
}
