import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "@/db/schema";

type OvtDb = ReturnType<typeof drizzle<typeof schema>>;

declare global {
    var __ovtDb: OvtDb | undefined;
}

function resolveSsl(databaseUrl: string): false | "require" {
    try {
        const hostname = new URL(databaseUrl).hostname;
        return hostname === "localhost" || hostname === "127.0.0.1" ? false : "require";
    } catch {
        return "require";
    }
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
        const client = postgres(databaseUrl, {
            ssl: resolveSsl(databaseUrl),
            prepare: false,
            max: 1
        });
        globalThis.__ovtDb = drizzle(client, { schema });
    }

    return globalThis.__ovtDb;
}
