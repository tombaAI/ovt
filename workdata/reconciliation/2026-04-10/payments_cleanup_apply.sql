-- Cleanup legacy payments
-- Cíl:
-- 1) smazat pouze prokazatelně nahrazené záznamy (strict match na bank import)
-- 2) ostatní ponechat pro ruční/hotovostní rekonciliaci

-- STRICT pravidlo pro smazání:
-- - payment.member -> members.variable_symbol
-- - existuje incoming bank tx se stejným datem a částkou
-- - VS bank tx = variable_symbol člena
-- - právě 1 match bank_tx na payment

-- 0) DRY RUN: kolik by se mazalo
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
select
  count(*) filter (where match_count = 1)::int as strict_delete_count,
  (select count(*) from app.payments)::int as total_payments,
  ((select count(*) from app.payments) - count(*) filter (where match_count = 1))::int as keep_count
from candidate;

-- 1) VOLITELNÉ: snapshot ids před smazáním
-- create table if not exists app.legacy_payments_delete_snapshot as
-- select p.*
-- from app.payments p
-- join (
--   with candidate as (
--     select p.id as payment_id, count(*) over (partition by p.id) as match_count
--     from app.payments p
--     join app.members m on m.id = p.member_id
--     join app.bank_transactions bt
--       on bt.amount > 0
--      and bt.date = p.paid_at
--      and bt.amount = p.amount
--      and nullif(trim(bt.variable_symbol), '') = m.variable_symbol::text
--     where p.paid_at is not null
--   )
--   select payment_id
--   from candidate
--   where match_count = 1
-- ) d on d.payment_id = p.id;

-- 2) APPLY DELETE (spouštět po odsouhlasení)
-- begin;
-- with candidate as (
--   select
--     p.id as payment_id,
--     count(*) over (partition by p.id) as match_count
--   from app.payments p
--   join app.members m on m.id = p.member_id
--   join app.bank_transactions bt
--     on bt.amount > 0
--    and bt.date = p.paid_at
--    and bt.amount = p.amount
--    and nullif(trim(bt.variable_symbol), '') = m.variable_symbol::text
--   where p.paid_at is not null
-- ),
-- strict_delete as (
--   select payment_id
--   from candidate
--   where match_count = 1
-- )
-- delete from app.payments p
-- using strict_delete sd
-- where p.id = sd.payment_id;
-- commit;

-- 3) Ostatní záznamy zůstávají v app.payments jako "cash/manual-ready"
--    a budou migrovány do nové payment_allocations vrstvy jako source_type='cash'.
