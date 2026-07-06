// Lokální disposable Postgres pro E2E bez Dockeru: PGlite (WASM Postgres)
// vystavený na TCP přes pglite-socket. Data žijí jen v paměti procesu.
// Přehraje všechny migrace od nuly a drží server, dokud ho nezabiješ (Ctrl+C).
//
//   node e2e/local-db.mjs          # port 54329
//   E2E_DB_PORT=5555 node e2e/local-db.mjs
//
// Pozn.: server obslouží jen jedno současné spojení — pro dev server + seed
// to stačí (postgres klient aplikace má max: 1), ale drizzle-kit push se přes
// něj zasekne. Viz e2e/README.md.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";

const port = Number(process.env.E2E_DB_PORT ?? 54329);
const migrationsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "supabase", "migrations");
const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith(".sql")).sort();

const db = new PGlite();
for (const f of files) {
    // pgcrypto v PGlite není a není potřeba — gen_random_uuid() je v jádru PG
    const sql = fs.readFileSync(path.join(migrationsDir, f), "utf8").replace(/create extension[^;]*;/gi, "");
    try {
        await db.exec(sql);
    } catch (e) {
        console.error(`Migrace selhala: ${f}\n${e.message}`);
        process.exit(1);
    }
}
console.log(`Migrace přehrány od nuly (${files.length} souborů).`);

const server = new PGLiteSocketServer({ db, port, host: "127.0.0.1" });
await server.start();
console.log(`Testovací DB běží: postgres://postgres:test@127.0.0.1:${port}/postgres`);
