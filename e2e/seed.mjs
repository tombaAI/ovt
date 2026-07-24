// Idempotentní seed testovací DB pro E2E smoke testy (viz e2e/README.md).
// Spouštět VÝHRADNĚ proti disposable testovací databázi — nikdy staging/produkce.
// Schéma musí být předem nahrané přes `npm run db:push` (drizzle-kit).
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
    console.error("DATABASE_URL není nastaven.");
    process.exit(1);
}
if (!process.env.E2E_ALLOW_SEED) {
    console.error("Pojistka: nastav E2E_ALLOW_SEED=1, čímž potvrzuješ, že DATABASE_URL míří na testovací DB.");
    process.exit(1);
}

const ssl = /localhost|127\.0\.0\.1/.test(url) ? false : "require";
const sql = postgres(url, { max: 1, ssl });

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? "e2e-admin@test.local";
const YEAR = 2026;

await sql`
    insert into app.admin_users (email, display_name, is_active)
    values (${ADMIN_EMAIL}, 'E2E Admin', true)
    on conflict (email) do update set is_active = true`;

const testMembers = [
    { id: 990001, firstName: "Jan", lastName: "Testovací", email: "jan.testovaci@test.local" },
    { id: 990002, firstName: "Petra", lastName: "Vzorová", email: "petra.vzorova@test.local" },
];
for (const m of testMembers) {
    await sql`
        insert into app.members (id, first_name, last_name, full_name, email, variable_symbol, member_from)
        values (${m.id}, ${m.firstName}, ${m.lastName}, ${`${m.firstName} ${m.lastName}`}, ${m.email}, ${m.id}, '2020-01-01')
        on conflict (id) do nothing`;
}

const [period] = await sql`
    insert into app.contribution_periods (year, amount_base)
    values (${YEAR}, 1500)
    on conflict (year) do update set amount_base = excluded.amount_base
    returning id`;

for (const m of testMembers) {
    await sql`
        insert into app.member_contributions (member_id, period_id, amount_total, amount_base)
        select ${m.id}, ${period.id}, 1500, 1500
        where not exists (
            select 1 from app.member_contributions where member_id = ${m.id} and period_id = ${period.id}
        )`;
}

console.log(`Seed hotov: admin ${ADMIN_EMAIL}, ${testMembers.length} členové, období ${YEAR}.`);
await sql.end();
