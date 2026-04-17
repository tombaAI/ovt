import fs from "node:fs";
import { neon } from "@neondatabase/serverless";

function readDatabaseUrl() {
	const env = fs.readFileSync(".env.local", "utf8");
	const match = env.match(/^DATABASE_URL=(.+)$/m);
	if (!match) {
		throw new Error("DATABASE_URL nenalezen v .env.local");
	}
	return match[1].trim();
}

const sql = neon(readDatabaseUrl());

function printSection(title, rows) {
	console.log(`\n=== ${title} ===`);
	if (!rows || rows.length === 0) {
		console.log("(no rows)");
		return;
	}
	console.table(rows);
}

try {
	const bankYearStats = await sql`
		select
			extract(year from bt.date)::int as year,
			count(*)::int as tx_count,
			sum(bt.amount)::int as tx_amount_sum,
			count(*) filter (where bt.amount > 0)::int as incoming_count,
			coalesce(sum(bt.amount) filter (where bt.amount > 0), 0)::int as incoming_sum,
			count(*) filter (where bt.amount > 0 and nullif(trim(bt.variable_symbol), '') is not null)::int as incoming_with_vs_count,
			count(*) filter (where bt.amount > 0 and nullif(trim(bt.variable_symbol), '') is null)::int as incoming_without_vs_count
		from app.bank_transactions bt
		group by extract(year from bt.date)
		order by year desc
	`;

	const paymentYearStats = await sql`
		select
			extract(year from p.paid_at)::int as year,
			count(*)::int as payments_count,
			coalesce(sum(p.amount), 0)::int as payments_sum
		from app.payments p
		where p.paid_at is not null
		group by extract(year from p.paid_at)
		order by year desc
	`;

	const contributionCoverage = await sql`
		with payment_totals as (
			select p.contrib_id, coalesce(sum(p.amount), 0)::int as paid_total
			from app.payments p
			group by p.contrib_id
		)
		select
			cp.year::int as year,
			count(*)::int as contrib_rows,
			coalesce(sum(coalesce(mc.amount_total, 0)), 0)::int as prescribed_sum,
			coalesce(sum(coalesce(pt.paid_total, 0)), 0)::int as paid_sum,
			coalesce(sum(coalesce(pt.paid_total, 0) - coalesce(mc.amount_total, 0)), 0)::int as delta_sum,
			count(*) filter (where coalesce(pt.paid_total, 0) = coalesce(mc.amount_total, 0))::int as exact_match_rows,
			count(*) filter (where coalesce(pt.paid_total, 0) > coalesce(mc.amount_total, 0))::int as overpaid_rows,
			count(*) filter (where coalesce(pt.paid_total, 0) < coalesce(mc.amount_total, 0))::int as underpaid_rows,
			count(*) filter (where coalesce(pt.paid_total, 0) = 0 and coalesce(mc.amount_total, 0) > 0)::int as unpaid_rows
		from app.member_contributions mc
		join app.contribution_periods cp on cp.id = mc.period_id
		left join payment_totals pt on pt.contrib_id = mc.id
		group by cp.year
		order by cp.year desc
	`;

	const bankToPaymentsByYear = await sql`
		with bank_pos as (
			select
				bt.id,
				bt.date,
				bt.amount,
				nullif(trim(bt.variable_symbol), '') as vs,
				extract(year from bt.date)::int as year
			from app.bank_transactions bt
			where bt.amount > 0
		),
		bank_member as (
			select
				b.id,
				b.year,
				b.amount,
				m.id as member_id
			from bank_pos b
			left join app.members m on m.variable_symbol::text = b.vs
		)
		select
			bm.year::int as year,
			count(*)::int as incoming_tx,
			count(*) filter (where bm.member_id is not null)::int as tx_with_member,
			count(*) filter (where bm.member_id is null)::int as tx_without_member,
			count(*) filter (
				where bm.member_id is not null
					and exists (
						select 1
						from app.payments p
						where p.member_id = bm.member_id
							and p.paid_at is not null
							and extract(year from p.paid_at)::int = bm.year
					)
			)::int as tx_member_has_any_payment_in_year,
			count(*) filter (
				where bm.member_id is not null
					and exists (
						select 1
						from app.payments p
						where p.member_id = bm.member_id
							and p.amount = bm.amount
							and p.paid_at is not null
							and extract(year from p.paid_at)::int = bm.year
					)
			)::int as tx_member_has_same_amount_in_year,
			count(*) filter (
				where bm.member_id is not null
					and exists (
						select 1
						from app.payments p
						where p.member_id = bm.member_id
							and p.amount = bm.amount
							and p.paid_at = (
								select bt2.date
								from app.bank_transactions bt2
								where bt2.id = bm.id
							)
					)
			)::int as tx_exact_member_amount_date_match
		from bank_member bm
		group by bm.year
		order by bm.year desc
	`;

	const bankMissingInPayments = await sql`
		with bank_pos as (
			select
				bt.id,
				bt.date,
				bt.amount,
				nullif(trim(bt.variable_symbol), '') as vs,
				extract(year from bt.date)::int as year,
				bt.counterparty_name,
				bt.message
			from app.bank_transactions bt
			where bt.amount > 0
		),
		bank_member as (
			select
				b.*,
				m.id as member_id,
				m.full_name
			from bank_pos b
			left join app.members m on m.variable_symbol::text = b.vs
		)
		select
			bm.id::int as bank_tx_id,
			bm.date::text as date,
			bm.amount::int as amount,
			bm.vs,
			bm.member_id::int,
			bm.full_name,
			coalesce(bm.counterparty_name, '') as counterparty_name,
			coalesce(bm.message, '') as message
		from bank_member bm
		where bm.member_id is not null
			and not exists (
				select 1
				from app.payments p
				where p.member_id = bm.member_id
					and p.amount = bm.amount
					and p.paid_at is not null
					and extract(year from p.paid_at)::int = bm.year
			)
		order by bm.date desc, bm.id desc
		limit 50
	`;

	const paymentsWithoutBankByYear = await sql`
		with payment_year as (
			select
				p.id,
				p.member_id,
				p.amount,
				p.paid_at,
				extract(year from p.paid_at)::int as year,
				m.variable_symbol::text as vs,
				m.full_name
			from app.payments p
			join app.members m on m.id = p.member_id
			where p.paid_at is not null
		)
		select
			py.year::int as year,
			count(*)::int as payments_total,
			count(*) filter (
				where not exists (
					select 1
					from app.bank_transactions bt
					where bt.amount > 0
						and bt.date is not null
						and extract(year from bt.date)::int = py.year
						and nullif(trim(bt.variable_symbol), '') = py.vs
						and bt.amount = py.amount
				)
			)::int as payments_without_matching_bank_tx
		from payment_year py
		group by py.year
		order by py.year desc
	`;

	const paymentMissingInBankSample = await sql`
		with payment_year as (
			select
				p.id,
				p.member_id,
				p.amount,
				p.paid_at,
				extract(year from p.paid_at)::int as year,
				m.variable_symbol::text as vs,
				m.full_name
			from app.payments p
			join app.members m on m.id = p.member_id
			where p.paid_at is not null
		)
		select
			py.year::int as year,
			py.id::int as payment_id,
			py.paid_at::text as paid_at,
			py.amount::int as amount,
			py.vs,
			py.full_name
		from payment_year py
		where py.year between 2020 and 2025
			and not exists (
				select 1
				from app.bank_transactions bt
				where bt.amount > 0
					and extract(year from bt.date)::int = py.year
					and nullif(trim(bt.variable_symbol), '') = py.vs
					and bt.amount = py.amount
			)
		order by py.year desc, py.paid_at desc
		limit 30
	`;

	const bankWithoutMemberSample = await sql`
		select
			extract(year from bt.date)::int as year,
			bt.id::int as bank_tx_id,
			bt.date::text as date,
			bt.amount::int as amount,
			nullif(trim(bt.variable_symbol), '') as vs,
			coalesce(bt.counterparty_name, '') as counterparty_name,
			coalesce(bt.message, '') as message
		from app.bank_transactions bt
		left join app.members m on m.variable_symbol::text = nullif(trim(bt.variable_symbol), '')
		where bt.amount > 0
			and extract(year from bt.date)::int between 2020 and 2025
			and m.id is null
		order by bt.date desc, bt.id desc
		limit 30
	`;

	const topUnpaidContributions = await sql`
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
			coalesce(mc.amount_total, 0)::int as prescribed,
			coalesce(pt.paid_total, 0)::int as paid,
			(coalesce(mc.amount_total, 0) - coalesce(pt.paid_total, 0))::int as outstanding
		from app.member_contributions mc
		join app.contribution_periods cp on cp.id = mc.period_id
		join app.members m on m.id = mc.member_id
		left join payment_totals pt on pt.contrib_id = mc.id
		where coalesce(mc.amount_total, 0) - coalesce(pt.paid_total, 0) > 0
		order by outstanding desc, cp.year desc
		limit 30
	`;

	printSection("Bank transactions by year", bankYearStats);
	printSection("Payments by year", paymentYearStats);
	printSection("Contribution coverage by year", contributionCoverage);
	printSection("Bank incoming vs payments (member matching)", bankToPaymentsByYear);
	printSection("Sample: bank tx with member but no same-amount payment in same year", bankMissingInPayments);
	printSection("Payments without matching bank tx (same year, VS, amount)", paymentsWithoutBankByYear);
	printSection("Sample: payments without matching bank tx (same year, VS, amount)", paymentMissingInBankSample);
	printSection("Sample: incoming bank tx without mapped member", bankWithoutMemberSample);
	printSection("Top outstanding contributions", topUnpaidContributions);
} finally {
	// Neon serverless klient nevyžaduje explicitní ukončení spojení.
}
