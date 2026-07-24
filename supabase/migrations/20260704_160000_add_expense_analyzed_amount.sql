-- Kontrola shody zjištěné vs. zapsané částky nákladu akce.
-- analyzed_amount = total_amount z poslední Gemini analýzy AKTUÁLNĚ přiložené přílohy.
-- Neshoda (amount != analyzed_amount po zaokrouhlení na haléře, včetně NULL) = alert v přehledu.
--
-- Bez SQL backfillu: existující náklady s přílohou dostanou analyzed_amount skutečnou
-- jednorázovou re-analýzou (skript scripts/backfill-analyzed-amount.ts) po nasazení, ne odhadem.
-- Viz docs/adr/0001-analyzed-amount-historical-backfill.md.

ALTER TABLE app.event_expenses
    ADD COLUMN IF NOT EXISTS analyzed_amount numeric(10,2);
