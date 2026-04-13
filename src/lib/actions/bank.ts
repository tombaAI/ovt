"use server";

import { getDb } from "@/lib/db";
import { fioBankTransactions, members, payments } from "@/db/schema";
import { sql, desc, and, gte, lte, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { fetchFioByPeriod, fetchFioLast, type FioTransaction } from "@/lib/fio";
import { createLedgerFromBankTx } from "./reconciliation";

// ── Typy ─────────────────────────────────────────────────────────────────────

export type SyncResult = {
    inserted: number;
    skipped: number;   // duplicity (fio_id už existuje)
    total: number;
};

export type BankTransactionRow = {
    id: number;
    fioId: number;
    date: string;
    amount: number;
    currency: string;
    variableSymbol: string | null;
    counterpartyAccount: string | null;
    counterpartyName: string | null;
    message: string | null;
    type: string | null;
    // párování s existujícími platbami
    matchedMemberId: number | null;
    matchedMemberName: string | null;
    matchedPaymentId: number | null;
    matchedPaymentAmount: number | null;
    matchedPaymentDate: string | null;
};

// ── Uložení transakcí (deduplikace přes fio_id) ───────────────────────────────

async function upsertTransactions(txs: FioTransaction[], createdBy = "fio-sync"): Promise<SyncResult> {
    if (txs.length === 0) return { inserted: 0, skipped: 0, total: 0 };

    const db = getDb();
    let inserted = 0;
    let skipped = 0;

    for (const tx of txs) {
        const result = await db.execute(sql`
            INSERT INTO app.fio_bank_transactions
                (fio_id, date, amount, currency, variable_symbol, constant_symbol, specific_symbol,
                 counterparty_account, counterparty_name, message, user_identification, type, comment, raw_data)
            VALUES
                (${tx.fioId}, ${tx.date}, ${tx.amount}, ${tx.currency},
                 ${tx.variableSymbol}, ${tx.constantSymbol}, ${tx.specificSymbol},
                 ${tx.counterpartyAccount}, ${tx.counterpartyName}, ${tx.message},
                 ${tx.userIdentification}, ${tx.type}, ${tx.comment}, ${JSON.stringify(tx.rawData)}::jsonb)
            ON CONFLICT (fio_id) DO NOTHING
            RETURNING id
        `);
        const rows = result as unknown as Array<{ id: number }>;
        if (rows.length === 0) {
            skipped++;
        } else {
            inserted++;
            // Příchozí platby (amount > 0) → také do payment_ledger + auto-match
            if (tx.amount > 0) {
                await createLedgerFromBankTx(
                    rows[0].id,
                    tx.date,
                    tx.amount,
                    tx.currency,
                    tx.variableSymbol,
                    tx.counterpartyAccount,
                    tx.counterpartyName,
                    tx.message,
                    createdBy,
                );
            }
        }
    }

    return { inserted, skipped, total: txs.length };
}

// ── Server actions ────────────────────────────────────────────────────────────

/**
 * Inkrementální sync — načte platby od posledního stažení (Fio bookmark).
 */
export async function syncBankTransactionsLast(): Promise<SyncResult> {
    const txs = await fetchFioLast();
    const result = await upsertTransactions(txs);
    revalidatePath("/dashboard/imports/bank");
    return result;
}

/**
 * Resync za zvolené období. Fio API povoluje max 365 dní na request —
 * delší rozsah automaticky rozdělíme do chunků.
 */
export async function syncBankTransactionsByPeriod(from: string, to: string): Promise<SyncResult> {
    const fromDate = new Date(from);
    const toDate   = new Date(to);

    // Rozděl na max 365denní chunky
    const chunks: Array<{ from: string; to: string }> = [];
    let cursor = fromDate;
    while (cursor <= toDate) {
        const chunkEnd = new Date(cursor);
        chunkEnd.setDate(chunkEnd.getDate() + 89); // max 90 dní (Fio API limit)
        if (chunkEnd > toDate) chunkEnd.setTime(toDate.getTime());
        chunks.push({
            from: cursor.toISOString().substring(0, 10),
            to:   chunkEnd.toISOString().substring(0, 10),
        });
        cursor = new Date(chunkEnd);
        cursor.setDate(cursor.getDate() + 1);
    }

    let total = 0, inserted = 0, skipped = 0;
    for (const chunk of chunks) {
        const txs = await fetchFioByPeriod(chunk.from, chunk.to);
        const r   = await upsertTransactions(txs);
        total    += r.total;
        inserted += r.inserted;
        skipped  += r.skipped;
        // Fio rate limit: 1 req / 30s — při více chuncích počkáme
        if (chunks.length > 1) await new Promise(res => setTimeout(res, 31_000));
    }

    revalidatePath("/dashboard/imports/bank");
    return { total, inserted, skipped };
}

/**
 * Vrátí seznam roků pro které máme bankovní transakce, sestupně.
 */
export async function loadBankTransactionYears(): Promise<number[]> {
    const db = getDb();
    const rows = await db.execute(
        sql`SELECT DISTINCT EXTRACT(YEAR FROM date)::int AS year FROM app.fio_bank_transactions ORDER BY year DESC`
    );
    return (rows as unknown as Array<{ year: number }>).map(r => r.year);
}

/**
 * Načte transakce z bank_transactions pro zobrazení v UI + porovná s payments.
 * Párování plateb je omezeno na stejný rok jako bankovní transakce.
 */
export async function loadBankTransactions(year: number): Promise<BankTransactionRow[]> {
    const db = getDb();

    const rows = await db
        .select({
            id:                  fioBankTransactions.id,
            fioId:               fioBankTransactions.fioId,
            date:                fioBankTransactions.date,
            amount:              fioBankTransactions.amount,
            currency:            fioBankTransactions.currency,
            variableSymbol:      fioBankTransactions.variableSymbol,
            counterpartyAccount: fioBankTransactions.counterpartyAccount,
            counterpartyName:    fioBankTransactions.counterpartyName,
            message:             fioBankTransactions.message,
            type:                fioBankTransactions.type,
        })
        .from(fioBankTransactions)
        .where(and(
            gte(fioBankTransactions.date, `${year}-01-01`),
            lte(fioBankTransactions.date, `${year}-12-31`),
        ))
        .orderBy(desc(fioBankTransactions.date));

    if (rows.length === 0) return [];

    // Mapa VS → člen
    const vsList = [...new Set(
        rows.map(r => r.variableSymbol).filter((v): v is string => v !== null && v !== "")
    )];

    const membersByVs = new Map<string, { memberId: number; fullName: string }>();
    if (vsList.length > 0) {
        const memberRows = await db
            .select({ variableSymbol: members.variableSymbol, id: members.id, fullName: members.fullName })
            .from(members)
            .where(inArray(sql`${members.variableSymbol}::text`, vsList));
        for (const m of memberRows) {
            if (m.variableSymbol != null) {
                membersByVs.set(String(m.variableSymbol), { memberId: m.id, fullName: m.fullName });
            }
        }
    }

    // Mapa memberId → platba ve stejném roce jako transakce
    // Klíč: `${memberId}` — bereme první platbu daného člena v daném roce (řazeno paidAt desc)
    const memberIds = [...new Set([...membersByVs.values()].map(m => m.memberId))];
    const paymentsByMemberId = new Map<number, { paymentId: number; amount: number; paidAt: string | null }>();
    if (memberIds.length > 0) {
        const paymentRows = await db
            .select({ memberId: payments.memberId, id: payments.id, amount: payments.amount, paidAt: payments.paidAt })
            .from(payments)
            .where(and(
                inArray(payments.memberId, memberIds),
                gte(payments.paidAt, `${year}-01-01`),
                lte(payments.paidAt, `${year}-12-31`),
            ))
            .orderBy(desc(payments.paidAt));
        for (const p of paymentRows) {
            if (!paymentsByMemberId.has(p.memberId)) {
                paymentsByMemberId.set(p.memberId, { paymentId: p.id, amount: p.amount, paidAt: p.paidAt as unknown as string | null });
            }
        }
    }

    return rows.map(row => {
        const member  = row.variableSymbol ? membersByVs.get(row.variableSymbol) : undefined;
        const payment = member ? paymentsByMemberId.get(member.memberId) : undefined;
        return {
            ...row,
            amount:               Number(row.amount), // numeric → string z Drizzle
            matchedMemberId:      member?.memberId ?? null,
            matchedMemberName:    member?.fullName ?? null,
            matchedPaymentId:     payment?.paymentId ?? null,
            matchedPaymentAmount: payment?.amount ?? null,
            matchedPaymentDate:   payment?.paidAt ?? null,
        };
    });
}
