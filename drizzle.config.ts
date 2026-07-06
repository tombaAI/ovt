import { defineConfig } from "drizzle-kit";

export default defineConfig({
    schema: "./src/db/schema.ts",
    out: "./drizzle",
    dialect: "postgresql",
    // Bez "app" ve filtru drizzle-kit push/pull celé aplikační schéma ignoruje
    // (default je jen "public") a tiše hlásí "No changes detected".
    schemaFilter: ["app", "public"],
    dbCredentials: {
        url: process.env.DATABASE_URL!
    }
});
