"use server";

import { getDb } from "@/lib/db";
import { bankTransactions, members, payments } from "@/db/schema";
import { sql, desc, and, gte, lte } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { fetchFioByPeriod, fetchFioLast, type FioTransaction } from "@/lib/fio";

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
};

// ── Uložení transakcí (deduplikace přes fio_id) ───────────────────────────────

async function upsertTransactions(txs: FioTransaction[]): Promise<SyncResult> {
    if (txs.length === 0) return { inserted: 0, skipped: 0, total: 0 };

    const db = getDb();
    let inserted = 0;
    let skipped = 0;

    for (const tx of txs) {
        const result = await db.execute(sql`
            INSERT INTO app.bank_transactions
                (fio_id, date, amount, currency, variable_symbol, constant_symbol, specific_symbol,
                 counterparty_account, counterparty_name, message, user_identification, type, comment, raw_data)
            VALUES
                (${tx.fioId}, ${tx.date}, ${tx.amount}, ${tx.currency},
                 ${tx.variableSymbol}, ${tx.constantSymbol}, ${tx.specificSymbol},
                 ${tx.counterpartyAccount}, ${tx.counterpartyName}, ${tx.message},
                 ${tx.userIdentification}, ${tx.type}, ${tx.comment}, ${JSON.stringify(tx.rawData)}::jsonb)
            ON CONFLICT (fio_id) DO NOTHING
        `);
        // rowCount = 0 znamená ON CONFLICT → přeskočeno
        const rowCount = (result as unknown as { rowCount?: number }).rowCount ?? 1;
        if (rowCount === 0) skipped++; else inserted++;
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
        chunkEnd.setDate(chunkEnd.getDate() + 359); // max 360 dní (Fio limit ~365, s rezervou)
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
 * Načte transakce z bank_transactions pro zobrazení v UI + porovná s payments.
 * Vrací transakce seřazené od nejnovějších, s informací o existujícím záznamu v payments.
 */
export async function loadBankTransactions(opts?: {
    from?: string;
    to?: string;
    limit?: number;
}): Promise<BankTransactionRow[]> {
    const db = getDb();

    let query = db
        .select({
            id:                  bankTransactions.id,
            fioId:               bankTransactions.fioId,
            date:                bankTransactions.date,
            amount:              bankTransactions.amount,
            currency:            bankTransactions.currency,
            variableSymbol:      bankTransactions.variableSymbol,
            counterpartyAccount: bankTransactions.counterpartyAccount,
            counterpartyName:    bankTransactions.counterpartyName,
            message:             bankTransactions.message,
            type:                bankTransactions.type,
        })
        .from(bankTransactions)
        .$dynamic();

    if (opts?.from && opts?.to) {
        query = query.where(and(
            gte(bankTransactions.date, opts.from),
            lte(bankTransactions.date, opts.to),
        ));
    } else if (opts?.from) {
        query = query.where(gte(bankTransactions.date, opts.from));
    }

    const rows = await query
        .orderBy(desc(bankTransactions.date))
        .limit(opts?.limit ?? 500);

    if (rows.length === 0) return [];

    // Párování přes variable_symbol — najdeme členy a jejich platby v jednom dotazu
    const vsList = rows
        .map(r => r.variableSymbol)
        .filter((v): v is string => v !== null && v !== "");

    // Mapa VS → člen
    const membersByVs = new Map<string, { memberId: number; fullName: string }>();
    if (vsList.length > 0) {
        const memberRows = await db
            .select({ variableSymbol: members.variableSymbol, id: members.id, fullName: members.fullName })
            .from(members)
            .where(sql`${members.variableSymbol}::text = ANY(${vsList})`);
        for (const m of memberRows) {
            if (m.variableSymbol != null) {
                membersByVs.set(String(m.variableSymbol), { memberId: m.id, fullName: m.fullName });
            }
        }
    }

    // Mapa VS → platba (bereme první nalezenu, řazeno od nejnovější)
    const memberIds = [...new Set([...membersByVs.values()].map(m => m.memberId))];
    const paymentsByMemberId = new Map<number, { paymentId: number; amount: number }>();
    if (memberIds.length > 0) {
        const paymentRows = await db
            .select({ memberId: payments.memberId, id: payments.id, amount: payments.amount })
            .from(payments)
            .where(sql`${payments.memberId} = ANY(${memberIds})`)
            .orderBy(desc(payments.createdAt));
        for (const p of paymentRows) {
            if (!paymentsByMemberId.has(p.memberId)) {
                paymentsByMemberId.set(p.memberId, { paymentId: p.id, amount: p.amount });
            }
        }
    }

    return rows.map(row => {
        const member = row.variableSymbol ? membersByVs.get(row.variableSymbol) : undefined;
        const payment = member ? paymentsByMemberId.get(member.memberId) : undefined;
        return {
            ...row,
            matchedMemberId:     member?.memberId ?? null,
            matchedMemberName:   member?.fullName ?? null,
            matchedPaymentId:    payment?.paymentId ?? null,
            matchedPaymentAmount: payment?.amount ?? null,
        };
    });
}
