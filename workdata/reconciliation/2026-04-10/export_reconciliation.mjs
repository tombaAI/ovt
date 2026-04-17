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
  if (!rows || rows.length === 0) {
    fs.writeFileSync(fullPath, "", "utf8");
    return { fullPath, rows: 0 };
  }

  const headers = Object.keys(rows[0]);
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(headers.map((h) => csvEscape(row[h])).join(","));
  }
  fs.writeFileSync(fullPath, `${lines.join("\n")}\n`, "utf8");
  return { fullPath, rows: rows.length };
}

const sql = neon(readDatabaseUrl());

async function run() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const yearSummary = await sql`
    with bank as (
      select
        extract(year from bt.date)::int as year,
        count(*) filter (where bt.amount > 0)::int as incoming_tx_count,
        coalesce(sum(bt.amount) filter (where bt.amount > 0), 0)::int as incoming_sum
      from app.bank_transactions bt
      group by extract(year from bt.date)
    ),
    pay as (
      select
        extract(year from p.paid_at)::int as year,
        count(*)::int as payments_count,
        coalesce(sum(p.amount), 0)::int as payments_sum
      from app.payments p
      where p.paid_at is not null
      group by extract(year from p.paid_at)
    ),
    coverage as (
      with payment_totals as (
        select p.contrib_id, coalesce(sum(p.amount), 0)::int as paid_total
        from app.payments p
        group by p.contrib_id
      )
      select
        cp.year::int as year,
        count(*)::int as contrib_rows,
        coalesce(sum(coalesce(mc.amount_total, 0)), 0)::int as prescribed_sum,
        coalesce(sum(coalesce(pt.paid_total, 0)), 0)::int as paid_to_prescriptions_sum,
        coalesce(sum(coalesce(pt.paid_total, 0) - coalesce(mc.amount_total, 0)), 0)::int as coverage_delta_sum
      from app.member_contributions mc
      join app.contribution_periods cp on cp.id = mc.period_id
      left join payment_totals pt on pt.contrib_id = mc.id
      group by cp.year
    )
    select
      y.year,
      coalesce(bank.incoming_tx_count, 0)::int as incoming_tx_count,
      coalesce(bank.incoming_sum, 0)::int as incoming_sum,
      coalesce(pay.payments_count, 0)::int as payments_count,
      coalesce(pay.payments_sum, 0)::int as payments_sum,
      coalesce(coverage.contrib_rows, 0)::int as contrib_rows,
      coalesce(coverage.prescribed_sum, 0)::int as prescribed_sum,
      coalesce(coverage.paid_to_prescriptions_sum, 0)::int as paid_to_prescriptions_sum,
      coalesce(coverage.coverage_delta_sum, 0)::int as coverage_delta_sum
    from (
      select year from bank
      union
      select year from pay
      union
      select year from coverage
    ) y
    left join bank on bank.year = y.year
    left join pay on pay.year = y.year
    left join coverage on coverage.year = y.year
    order by y.year desc
  `;

  const bankUnmappedMember = await sql`
    select
      bt.id::int as bank_tx_id,
      bt.date::text as tx_date,
      extract(year from bt.date)::int as year,
      bt.amount::int as amount,
      nullif(trim(bt.variable_symbol), '') as variable_symbol,
      coalesce(bt.counterparty_name, '') as counterparty_name,
      coalesce(bt.message, '') as message
    from app.bank_transactions bt
    left join app.members m on m.variable_symbol::text = nullif(trim(bt.variable_symbol), '')
    where bt.amount > 0
      and m.id is null
    order by bt.date desc, bt.id desc
  `;

  const bankMemberNoPaymentMatch = await sql`
    with bank_pos as (
      select
        bt.id,
        bt.date,
        bt.amount,
        nullif(trim(bt.variable_symbol), '') as vs,
        extract(year from bt.date)::int as year,
        coalesce(bt.counterparty_name, '') as counterparty_name,
        coalesce(bt.message, '') as message
      from app.bank_transactions bt
      where bt.amount > 0
    ),
    bank_member as (
      select
        b.*,
        m.id as member_id,
        m.full_name
      from bank_pos b
      join app.members m on m.variable_symbol::text = b.vs
    )
    select
      bm.id::int as bank_tx_id,
      bm.date::text as tx_date,
      bm.year::int as year,
      bm.amount::int as amount,
      bm.vs as variable_symbol,
      bm.member_id::int as member_id,
      bm.full_name,
      bm.counterparty_name,
      bm.message
    from bank_member bm
    where not exists (
      select 1
      from app.payments p
      where p.member_id = bm.member_id
        and p.amount = bm.amount
        and p.paid_at is not null
        and extract(year from p.paid_at)::int = bm.year
    )
    order by bm.date desc, bm.id desc
  `;

  const paymentsNoBankMatch = await sql`
    with payment_year as (
      select
        p.id,
        p.member_id,
        p.amount,
        p.paid_at,
        extract(year from p.paid_at)::int as year,
        m.variable_symbol::text as vs,
        m.full_name,
        p.contrib_id
      from app.payments p
      join app.members m on m.id = p.member_id
      where p.paid_at is not null
    )
    select
      py.id::int as payment_id,
      py.paid_at::text as paid_at,
      py.year::int as year,
      py.amount::int as amount,
      py.vs as variable_symbol,
      py.member_id::int as member_id,
      py.full_name,
      py.contrib_id::int as contrib_id
    from payment_year py
    where not exists (
      select 1
      from app.bank_transactions bt
      where bt.amount > 0
        and extract(year from bt.date)::int = py.year
        and nullif(trim(bt.variable_symbol), '') = py.vs
        and bt.amount = py.amount
    )
    order by py.paid_at desc, py.id desc
  `;

  const outstandingContributions = await sql`
    with payment_totals as (
      select p.contrib_id, coalesce(sum(p.amount), 0)::int as paid_total
      from app.payments p
      group by p.contrib_id
    )
    select
      cp.year::int as year,
      mc.id::int as contrib_id,
      m.id::int as member_id,
      m.full_name,
      coalesce(m.variable_symbol::text, '') as variable_symbol,
      coalesce(mc.amount_total, 0)::int as prescribed,
      coalesce(pt.paid_total, 0)::int as paid,
      (coalesce(mc.amount_total, 0) - coalesce(pt.paid_total, 0))::int as outstanding,
      case
        when coalesce(pt.paid_total, 0) = coalesce(mc.amount_total, 0) then 'exact'
        when coalesce(pt.paid_total, 0) > coalesce(mc.amount_total, 0) then 'overpaid'
        when coalesce(pt.paid_total, 0) = 0 then 'unpaid'
        else 'underpaid'
      end as status
    from app.member_contributions mc
    join app.contribution_periods cp on cp.id = mc.period_id
    join app.members m on m.id = mc.member_id
    left join payment_totals pt on pt.contrib_id = mc.id
    where coalesce(pt.paid_total, 0) <> coalesce(mc.amount_total, 0)
    order by cp.year desc, outstanding desc, mc.id
  `;

  const familyPaymentCandidates = await sql`
    with bank_pos as (
      select
        bt.id,
        bt.date,
        extract(year from bt.date)::int as year,
        bt.amount,
        nullif(trim(bt.variable_symbol), '') as vs,
        coalesce(bt.counterparty_name, '') as counterparty_name,
        coalesce(bt.message, '') as message
      from app.bank_transactions bt
      where bt.amount > 0
    ),
    by_member_year as (
      select
        bp.id,
        bp.date,
        bp.year,
        bp.amount,
        bp.vs,
        bp.counterparty_name,
        bp.message,
        m.id as member_id,
        m.full_name,
        (
          select coalesce(sum(p.amount), 0)::int
          from app.payments p
          where p.member_id = m.id
            and p.paid_at is not null
            and extract(year from p.paid_at)::int = bp.year
        ) as member_paid_in_year,
        (
          select count(*)::int
          from app.payments p
          where p.member_id = m.id
            and p.paid_at is not null
            and extract(year from p.paid_at)::int = bp.year
        ) as member_payment_count_in_year
      from bank_pos bp
      left join app.members m on m.variable_symbol::text = bp.vs
    )
    select
      bmy.id::int as bank_tx_id,
      bmy.date::text as tx_date,
      bmy.year::int as year,
      bmy.amount::int as amount,
      bmy.vs as variable_symbol,
      bmy.member_id::int as member_id,
      bmy.full_name,
      bmy.member_paid_in_year::int as member_paid_in_year,
      bmy.member_payment_count_in_year::int as member_payment_count_in_year,
      bmy.counterparty_name,
      bmy.message,
      case
        when bmy.member_id is null then 'no_member'
        when bmy.member_paid_in_year > bmy.amount then 'possible_split_or_multi'
        when bmy.member_payment_count_in_year >= 2 then 'possible_split_or_multi'
        when bmy.message ~ '[+]| a |,|/' then 'possible_family_text'
        when bmy.amount >= 1800 then 'possible_family_amount'
        else 'review'
      end as candidate_reason
    from by_member_year bmy
    where bmy.member_id is null
      or bmy.member_paid_in_year > bmy.amount
      or bmy.member_payment_count_in_year >= 2
      or bmy.message ~ '[+]| a |,|/'
      or bmy.amount >= 1800
    order by bmy.date desc, bmy.id desc
  `;

  const writes = [];
  writes.push(writeCsv("year_summary.csv", yearSummary));
  writes.push(writeCsv("bank_unmapped_member.csv", bankUnmappedMember));
  writes.push(writeCsv("bank_member_no_payment_match.csv", bankMemberNoPaymentMatch));
  writes.push(writeCsv("payments_no_bank_match.csv", paymentsNoBankMatch));
  writes.push(writeCsv("outstanding_contributions.csv", outstandingContributions));
  writes.push(writeCsv("family_payment_candidates.csv", familyPaymentCandidates));

  const manifest = {
    generated_at: new Date().toISOString(),
    out_dir: OUT_DIR,
    files: writes,
    counts: {
      year_summary: yearSummary.length,
      bank_unmapped_member: bankUnmappedMember.length,
      bank_member_no_payment_match: bankMemberNoPaymentMatch.length,
      payments_no_bank_match: paymentsNoBankMatch.length,
      outstanding_contributions: outstandingContributions.length,
      family_payment_candidates: familyPaymentCandidates.length,
    },
  };

  fs.writeFileSync(path.join(OUT_DIR, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  console.log("Reconciliation exports generated:");
  console.table(manifest.counts);
  console.log(`Manifest: ${path.join(OUT_DIR, "manifest.json")}`);
}

run().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
