import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";

import * as schema from "@/db/schema";

type OvtDb = ReturnType<typeof drizzle<typeof schema>>;

declare global {
    var __ovtDb: OvtDb | undefined;
}

export function hasDatabaseUrl(): boolean {
    return Boolean(process.env.DATABASE_URL);
}

export function getDb(): OvtDb {
    const databaseUrl = process.env.DATABASE_URL;

    if (!databaseUrl) {
        throw new Error("DATABASE_URL is not configured.");
    }

    if (!globalThis.__ovtDb) {
        globalThis.__ovtDb = drizzle(neon(databaseUrl), { schema });
    }

    return globalThis.__ovtDb;
}
