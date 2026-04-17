import fs from "node:fs";
import path from "node:path";
import { neon } from "@neondatabase/serverless";

const OUT_DIR = "workdata/reconciliation/2026-04-10";

function readDatabaseUrl() {
  const env = fs.readFileSync(".env.local", "utf8");
  const match = env.match(/^DATABASE_URL=(.+)$/m);
  if (!match) throw new Error("DATABASE_URL not found in .env.local");
  return match[1].trim();
}

function csvEscape(value) {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (s.includes('"') || s.includes(",") || s.includes("\n")) {
    return `"${s.replaceAll('"', '""')}"`;
  }
  return s;
}

function writeCsv(fileName, rows) {
  const fullPath = path.join(OUT_DIR, fileName);
  if (!rows.length) {
    fs.writeFileSync(fullPath, "", "utf8");
    return;
  }
  const headers = Object.keys(rows[0]);
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(headers.map((h) => csvEscape(row[h])).join(","));
  }
  fs.writeFileSync(fullPath, `${lines.join("\n")}\n`, "utf8");
}

const sql = neon(readDatabaseUrl());

async function run() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  // STRICT: prokazatelná náhrada importovanou bankovní platbou
  // podmínky: shoda člena přes VS, datum, částka a přesně 1 bankovní transakce
  const strictDelete = await sql`
    with candidate as (
      select
        p.id as payment_id,
        p.contrib_id,
        p.member_id,
        p.amount,
        p.paid_at,
        p.note,
        m.full_name,
        m.variable_symbol::text as variable_symbol,
        bt.id as bank_tx_id,
        bt.date as bank_date,
        bt.amount as bank_amount,
        bt.counterparty_name,
        bt.message,
        count(*) over (partition by p.id) as match_count
      from app.payments p
      join app.members m on m.id = p.member_id
      join app.bank_transactions bt
        on bt.amount > 0
       and bt.date = p.paid_at
       and bt.amount = p.amount
       and nullif(trim(bt.variable_symbol), '') = m.variable_symbol::text
      where p.paid_at is not null
    )
    select
      payment_id::int,
      contrib_id::int,
      member_id::int,
      full_name,
      variable_symbol,
      paid_at::text,
      amount::int,
      bank_tx_id::int,
      bank_date::text,
      bank_amount::int,
      coalesce(counterparty_name, '') as bank_counterparty_name,
      coalesce(message, '') as bank_message,
      coalesce(note, '') as payment_note,
      'delete_candidate_strict' as classification
    from candidate
    where match_count = 1
    order by paid_at desc, payment_id desc
  `;

  // všechny ostatní payments = ponechat jako cash/manual-ready pro rekonciliaci
  const keepAsCash = await sql`
    with strict_delete as (
      with candidate as (
        select
          p.id as payment_id,
          count(*) over (partition by p.id) as match_count
        from app.payments p
        join app.members m on m.id = p.member_id
        join app.bank_transactions bt
          on bt.amount > 0
         and bt.date = p.paid_at
         and bt.amount = p.amount
         and nullif(trim(bt.variable_symbol), '') = m.variable_symbol::text
        where p.paid_at is not null
      )
      select payment_id
      from candidate
      where match_count = 1
    )
    select
      p.id::int as payment_id,
      p.contrib_id::int as contrib_id,
      p.member_id::int as member_id,
      m.full_name,
      m.variable_symbol::text as variable_symbol,
      p.paid_at::text as paid_at,
      p.amount::int as amount,
      coalesce(p.note, '') as payment_note,
      case
        when exists (
          select 1
          from app.bank_transactions bt
          where bt.amount > 0
            and bt.amount = p.amount
            and bt.date is not null
            and p.paid_at is not null
            and extract(year from bt.date)::int = extract(year from p.paid_at)::int
            and nullif(trim(bt.variable_symbol), '') = m.variable_symbol::text
        ) then 'keep_manual_review_has_weak_bank_evidence'
        else 'keep_as_cash_reconciliation'
      end as classification
    from app.payments p
    join app.members m on m.id = p.member_id
    where not exists (
      select 1
      from strict_delete sd
      where sd.payment_id = p.id
    )
    order by p.paid_at desc nulls last, p.id desc
  `;

  const summary = await sql`
    with strict as (
      with candidate as (
        select
          p.id as payment_id,
          count(*) over (partition by p.id) as match_count
        from app.payments p
        join app.members m on m.id = p.member_id
        join app.bank_transactions bt
          on bt.amount > 0
         and bt.date = p.paid_at
         and bt.amount = p.amount
         and nullif(trim(bt.variable_symbol), '') = m.variable_symbol::text
        where p.paid_at is not null
      )
      select count(*)::int as strict_delete_count
      from candidate
      where match_count = 1
    ),
    total as (
      select count(*)::int as total_payments from app.payments
    )
    select
      total.total_payments,
      strict.strict_delete_count,
      (total.total_payments - strict.strict_delete_count)::int as keep_count
    from total, strict
  `;

  writeCsv("payments_delete_candidates_strict.csv", strictDelete);
  writeCsv("payments_keep_for_cash_reconciliation.csv", keepAsCash);

  const result = {
    generated_at: new Date().toISOString(),
    strict_delete_count: strictDelete.length,
    keep_count: keepAsCash.length,
    total_count: strictDelete.length + keepAsCash.length,
    sql_summary: summary[0]
  };

  fs.writeFileSync(path.join(OUT_DIR, "payments_cleanup_summary.json"), `${JSON.stringify(result, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(result, null, 2));
}

run().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
