import postgres from "postgres";

type SqlClient = ReturnType<typeof postgres>;

declare global {
    var __ovtSqlClient: SqlClient | undefined;
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

export function getSqlClient(): SqlClient {
    const databaseUrl = process.env.DATABASE_URL;

    if (!databaseUrl) {
        throw new Error("DATABASE_URL is not configured.");
    }

    if (!globalThis.__ovtSqlClient) {
        globalThis.__ovtSqlClient = postgres(databaseUrl, {
            ssl: resolveSsl(databaseUrl),
            prepare: false,
            max: 1
        });
    }

    return globalThis.__ovtSqlClient;
}
