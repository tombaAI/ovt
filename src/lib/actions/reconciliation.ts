"use server";

import { eq, sql, and, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { getDb } from "@/lib/db";
import {
    paymentLedger, paymentAllocations, bankImportTransactions,
    memberContributions, contributionPeriods, members, importProfiles,
} from "@/db/schema";

// ── Typy ─────────────────────────────────────────────────────────────────────

export type ReconciliationStatus = "unmatched" | "suggested" | "confirmed" | "ignored";

export type LedgerStats = {
    unmatched:   number;
    suggested:   number;
    confirmed:   number;
    ignored:     number;
    total:       number;
    fio_bank:    number;
    file_import: number;
    cash:        number;
    profiles:    Array<{ id: number; name: string; count: number }>;
};

export type LedgerRow = {
    id:                   number;
    sourceType:           string;
    profileId:            number | null;
    profileName:          string | null;
    paidAt:               string;
    amount:               number;
    variableSymbol:       string | null;
    counterpartyName:     string | null;
    counterpartyAccount:  string | null;
    message:              string | null;
    note:                 string | null;
    reconciliationStatus: ReconciliationStatus;
    createdAt:            string;
    // Alokace (join)
    allocations: Array<{
        id:          number;
        contribId:   number;
        memberId:    number;
        memberName:  string;
        amount:      number;
        isSuggested: boolean;
        confirmedBy: string | null;
    }>;
};

// Drizzle vrací NUMERIC(10,2) jako string → helper pro INSERT (number → string)
const dec = (v: number): string => v.toFixed(2);

// ── Interní auto-matcher ──────────────────────────────────────────────────────

/**
 * Pokusí se automaticky napárovat ledger položku na předpis příspěvku.
 *
 * Logika:
 *  1. VS musí jednoznačně odpovídat jednomu členu.
 *  2. Člen musí mít předpis pro rok platby.
 *  3. Zbývající nezaplacená částka = amount platby → auto-confirm.
 *  4. Jinak (VS sedí, ale částka nesedí) → suggested.
 */
async function autoMatchLedgerEntry(
    db:        ReturnType<typeof getDb>,
    ledgerId:  number,
    vs:        string | null,
    amount:    number,
    paidAt:    string,   // YYYY-MM-DD
    createdBy: string,
): Promise<void> {
    if (!vs?.trim()) return;

    const year = parseInt(paidAt.substring(0, 4), 10);

    // 1. Najdi člena podle VS (musí být přesně jeden)
    const memberRows = await db
        .select({ id: members.id })
        .from(members)
        .where(eq(sql`${members.variableSymbol}::text`, vs.trim()));

    if (memberRows.length !== 1) return;
    const memberId = memberRows[0].id;

    // 2. Najdi předpis příspěvku pro daný rok
    const contribRows = await db
        .select({
            contribId:   memberContributions.id,
            amountTotal: memberContributions.amountTotal,
        })
        .from(memberContributions)
        .innerJoin(contributionPeriods, eq(memberContributions.periodId, contributionPeriods.id))
        .where(and(
            eq(memberContributions.memberId, memberId),
            eq(contributionPeriods.year, year),
        ));

    if (contribRows.length !== 1 || !contribRows[0].amountTotal) return;
    const { contribId, amountTotal } = contribRows[0];

    // 3. Zjisti kolik už je potvrzeně alokováno na tento předpis
    const [allocResult] = await db
        .select({ allocated: sql<number>`coalesce(sum(${paymentAllocations.amount}), 0)` })
        .from(paymentAllocations)
        .innerJoin(paymentLedger, eq(paymentAllocations.ledgerId, paymentLedger.id))
        .where(and(
            eq(paymentAllocations.contribId, contribId),
            eq(paymentLedger.reconciliationStatus, "confirmed"),
        ));

    const alreadyAllocated = Number(allocResult?.allocated ?? 0);
    const remaining = amountTotal - alreadyAllocated;

    if (remaining <= 0) return; // předpis je již plně uhrazen

    if (amount === remaining) {
        // Přesná shoda → auto-confirm
        await db.insert(paymentAllocations).values({
            ledgerId,
            contribId,
            memberId,
            amount:      dec(amount),
            isSuggested: false,
            confirmedBy: "auto-match",
            confirmedAt: new Date(),
            createdBy,
        });
        await db.update(paymentLedger)
            .set({ reconciliationStatus: "confirmed", updatedAt: new Date() })
            .where(eq(paymentLedger.id, ledgerId));
    } else {
        // VS sedí, ale částka nesedí → suggested (admin rozhodne)
        await db.insert(paymentAllocations).values({
            ledgerId,
            contribId,
            memberId,
            amount:      dec(amount),   // celá platba jako návrh, admin upraví pokud potřeba
            isSuggested: true,
            createdBy,
        });
        await db.update(paymentLedger)
            .set({ reconciliationStatus: "suggested", updatedAt: new Date() })
            .where(eq(paymentLedger.id, ledgerId));
    }
}

// ── Vytvoření ledger záznamu z Fio transakce ──────────────────────────────────

/**
 * Vytvoří payment_ledger záznam z existující bank_transactions řádku.
 * Idempotentní — pokud ledger pro daný bank_tx_id už existuje, vrátí jeho id.
 * Spustí auto-matcher.
 */
export async function createLedgerFromBankTx(
    fioBankTxId:   number,
    paidAt:     string,
    amount:     number,
    currency:   string,
    vs:         string | null,
    counterpartyAccount: string | null,
    counterpartyName:    string | null,
    message:    string | null,
    createdBy:  string,
): Promise<number> {
    const db = getDb();

    // Zkontroluj zda ledger záznam již existuje
    const existing = await db
        .select({ id: paymentLedger.id })
        .from(paymentLedger)
        .where(eq(paymentLedger.fioBankTxId, fioBankTxId));

    if (existing.length > 0) return existing[0].id;

    // Vlož nový záznam
    const [inserted] = await db.insert(paymentLedger).values({
        sourceType:          "fio_bank",
        fioBankTxId,
        paidAt,
        amount:               dec(amount),
        currency,
        variableSymbol:      vs,
        counterpartyAccount,
        counterpartyName,
        message,
        reconciliationStatus: "unmatched",
        createdBy,
    }).returning({ id: paymentLedger.id });

    // Spusť auto-matcher
    await autoMatchLedgerEntry(db, inserted.id, vs, amount, paidAt, createdBy);

    return inserted.id;
}

// ── Vytvoření ledger záznamu z file import transakce ─────────────────────────

/**
 * Vytvoří payment_ledger záznam z bank_import_transactions řádku.
 * Idempotentní — pokud ledger_id je already set, vrátí existující id.
 * Spustí auto-matcher. Zpětně nastaví bank_import_transactions.ledger_id.
 */
export async function createLedgerFromImportTx(
    importTxId:  number,
    importRunId: number | null,
    paidAt:      string,
    amount:      number,
    currency:    string,
    vs:          string | null,
    counterpartyAccount: string | null,
    counterpartyName:    string | null,
    message:     string | null,
    createdBy:   string,
): Promise<number> {
    const db = getDb();

    // Zkontroluj zda ledger záznam již existuje
    const existing = await db
        .select({ id: paymentLedger.id })
        .from(paymentLedger)
        .where(eq(paymentLedger.bankImportTxId, importTxId));

    if (existing.length > 0) return existing[0].id;

    const [inserted] = await db.insert(paymentLedger).values({
        sourceType:           "file_import",
        bankImportTxId:       importTxId,
        importRunId,
        paidAt,
        amount:               dec(amount),
        currency,
        variableSymbol:       vs,
        counterpartyAccount,
        counterpartyName,
        message,
        reconciliationStatus: "unmatched",
        createdBy,
    }).returning({ id: paymentLedger.id });

    // Zpětně nastav bank_import_transactions.ledger_id
    await db.update(bankImportTransactions)
        .set({ ledgerId: inserted.id })
        .where(eq(bankImportTransactions.id, importTxId));

    // Spusť auto-matcher
    await autoMatchLedgerEntry(db, inserted.id, vs, amount, paidAt, createdBy);

    return inserted.id;
}

// ── Hotovostní platba ─────────────────────────────────────────────────────────

export type CashPaymentInput = {
    amount:     number;
    paidAt:     string;
    note:       string | null;
};

/**
 * Rychlý příjem hotovosti bez okamžitého párování.
 * Vytvoří ledger záznam s reconciliation_status = 'unmatched'.
 */
export async function createCashPayment(
    input: CashPaymentInput,
): Promise<{ error: string } | { id: number }> {
    const session = await auth();
    const createdBy = session?.user?.email ?? "unknown";
    const db = getDb();

    if (input.amount <= 0) return { error: "Částka musí být kladná" };
    if (!input.paidAt)     return { error: "Datum je povinné" };

    const [inserted] = await db.insert(paymentLedger).values({
        sourceType:           "cash",
        paidAt:               input.paidAt,
        amount:               dec(input.amount),
        currency:             "CZK",
        note:                 input.note,
        reconciliationStatus: "unmatched",
        createdBy,
    }).returning({ id: paymentLedger.id });

    revalidatePath("/dashboard/payments");
    return { id: inserted.id };
}

/**
 * Přímá hotovostní platba nad konkrétním závazkem.
 * Vytvoří ledger záznam + alokaci → stav 'confirmed' okamžitě.
 */
export async function createCashPaymentOnContrib(input: {
    contribId: number;
    memberId:  number;
    amount:    number;
    paidAt:    string;
    note:      string | null;
}): Promise<{ error: string } | { id: number }> {
    const session = await auth();
    const createdBy = session?.user?.email ?? "unknown";
    const db = getDb();

    if (input.amount <= 0) return { error: "Částka musí být kladná" };
    if (!input.paidAt)     return { error: "Datum je povinné" };

    // Ověř existenci předpisu
    const [contrib] = await db.select({ id: memberContributions.id })
        .from(memberContributions)
        .where(eq(memberContributions.id, input.contribId));
    if (!contrib) return { error: "Předpis nenalezen" };

    // Vše v jedné transakci
    await db.transaction(async (tx) => {
        const [ledger] = await tx.insert(paymentLedger).values({
            sourceType:           "cash",
            paidAt:               input.paidAt,
            amount:               dec(input.amount),
            currency:             "CZK",
            note:                 input.note,
            reconciliationStatus: "confirmed",
            createdBy,
        }).returning({ id: paymentLedger.id });

        await tx.insert(paymentAllocations).values({
            ledgerId:    ledger.id,
            contribId:   input.contribId,
            memberId:    input.memberId,
            amount:      dec(input.amount),
            note:        input.note,
            isSuggested: false,
            confirmedBy: createdBy,
            confirmedAt: new Date(),
            createdBy,
        });
    });

    revalidatePath("/dashboard/contributions");
    revalidatePath("/dashboard/payments");
    return { id: 0 }; // caller nepotřebuje přesné id
}

// ── Auto-match všech unmatched ────────────────────────────────────────────────

/**
 * Spustí auto-matcher na všechny 'unmatched' záznamy v ledgeru.
 *
 * Implementace: 3 bulk SQL operace místo N×5 sekvenčních round-tripů.
 *
 * 1. CTE query — najde všechny kandidáty a určí akci (confirmed / suggested)
 * 2. Bulk INSERT do payment_allocations
 * 3. Bulk UPDATE payment_ledger statusů
 */
export async function runAutoMatchAll(): Promise<{ matched: number; suggested: number }> {
    await auth();
    const db = getDb();

    // 1. Jeden dotaz najde všechny kandidáty pro párování
    //    Podmínky (stejná logika jako autoMatchLedgerEntry):
    //    - ledger je unmatched, má VS
    //    - VS odpovídá přesně jednomu členu
    //    - člen má předpis pro rok platby
    //    - předpis má amount_total
    const candidates = await db.execute<{
        ledger_id:   number;
        member_id:   number;
        contrib_id:  number;
        amount:      string;
        remaining:   string;
        action:      "confirmed" | "suggested";
    }>(sql`
        WITH unmatched AS (
            SELECT id, variable_symbol, amount, paid_at
            FROM app.payment_ledger
            WHERE reconciliation_status = 'unmatched'
              AND variable_symbol IS NOT NULL
              AND variable_symbol <> ''
        ),
        unique_members AS (
            SELECT variable_symbol::text AS vs, id AS member_id
            FROM app.members
            WHERE variable_symbol IS NOT NULL
              AND (
                  SELECT count(*) FROM app.members m2
                  WHERE m2.variable_symbol::text = app.members.variable_symbol::text
              ) = 1
        ),
        contribs AS (
            SELECT mc.id AS contrib_id, mc.member_id, mc.amount_total,
                   cp.year
            FROM app.member_contributions mc
            JOIN app.contribution_periods cp ON cp.id = mc.period_id
            WHERE mc.amount_total IS NOT NULL AND mc.amount_total > 0
        ),
        confirmed_paid AS (
            SELECT pa.contrib_id, coalesce(sum(pa.amount), 0) AS paid
            FROM app.payment_allocations pa
            JOIN app.payment_ledger pl ON pl.id = pa.ledger_id
            WHERE pl.reconciliation_status = 'confirmed'
            GROUP BY pa.contrib_id
        ),
        candidates AS (
            SELECT
                u.id                                              AS ledger_id,
                um.member_id,
                c.contrib_id,
                u.amount,
                c.amount_total - coalesce(cp2.paid, 0)           AS remaining
            FROM unmatched u
            JOIN unique_members um ON um.vs = u.variable_symbol
            JOIN contribs c ON c.member_id = um.member_id
              AND c.year = EXTRACT(YEAR FROM u.paid_at)
            LEFT JOIN confirmed_paid cp2 ON cp2.contrib_id = c.contrib_id
            WHERE c.amount_total - coalesce(cp2.paid, 0) > 0
        )
        SELECT
            ledger_id,
            member_id,
            contrib_id,
            amount::text,
            remaining::text,
            CASE WHEN abs(amount - remaining) < 0.001 THEN 'confirmed' ELSE 'suggested' END AS action
        FROM candidates
    `);

    if (candidates.length === 0) {
        revalidatePath("/dashboard/payments");
        return { matched: 0, suggested: 0 };
    }

    const now = new Date().toISOString();
    let matched   = 0;
    let suggested = 0;

    // 2. Bulk INSERT alokací — po skupinách podle akce
    for (const c of candidates) {
        const isConfirmed = c.action === "confirmed";
        await db.execute(sql`
            INSERT INTO app.payment_allocations
                (ledger_id, contrib_id, member_id, amount, is_suggested, confirmed_by, confirmed_at, created_by)
            VALUES (
                ${c.ledger_id}, ${c.contrib_id}, ${c.member_id}, ${c.amount}::numeric,
                ${!isConfirmed},
                ${isConfirmed ? "auto-match" : null},
                ${isConfirmed ? now : null},
                'auto-match'
            )
            ON CONFLICT DO NOTHING
        `);
        if (isConfirmed) matched++; else suggested++;
    }

    // 3. Bulk UPDATE ledger statusů
    const confirmedIds = candidates.filter(c => c.action === "confirmed").map(c => c.ledger_id);
    const suggestedIds = candidates.filter(c => c.action === "suggested").map(c => c.ledger_id);

    if (confirmedIds.length > 0) {
        await db.execute(sql`
            UPDATE app.payment_ledger
            SET reconciliation_status = 'confirmed', updated_at = now()
            WHERE id = ANY(${sql.raw(`ARRAY[${confirmedIds.join(",")}]`)}::int[])
        `);
    }
    if (suggestedIds.length > 0) {
        await db.execute(sql`
            UPDATE app.payment_ledger
            SET reconciliation_status = 'suggested', updated_at = now()
            WHERE id = ANY(${sql.raw(`ARRAY[${suggestedIds.join(",")}]`)}::int[])
        `);
    }

    revalidatePath("/dashboard/payments");
    return { matched, suggested };
}

// ── Statistiky ledgeru ────────────────────────────────────────────────────────

export async function getLedgerStats(year?: number): Promise<LedgerStats> {
    const db = getDb();
    const yearCond = year ? sql`EXTRACT(YEAR FROM ${paymentLedger.paidAt}) = ${year}` : undefined;

    const [statusRows, sourceRows, profileRows] = await Promise.all([
        db.select({
            status: paymentLedger.reconciliationStatus,
            count:  sql<number>`count(*)`,
        })
        .from(paymentLedger)
        .where(yearCond)
        .groupBy(paymentLedger.reconciliationStatus),

        db.select({
            source: paymentLedger.sourceType,
            count:  sql<number>`count(*)`,
        })
        .from(paymentLedger)
        .where(yearCond)
        .groupBy(paymentLedger.sourceType),

        db.select({
            profileId:   importProfiles.id,
            profileName: importProfiles.name,
            count:       sql<number>`count(*)`,
        })
        .from(paymentLedger)
        .innerJoin(bankImportTransactions, eq(paymentLedger.bankImportTxId, bankImportTransactions.id))
        .innerJoin(importProfiles, eq(bankImportTransactions.profileId, importProfiles.id))
        .where(and(yearCond, eq(paymentLedger.sourceType, "file_import")))
        .groupBy(importProfiles.id, importProfiles.name),
    ]);

    const byStatus = Object.fromEntries(statusRows.map(r => [r.status, Number(r.count)]));
    const bySource = Object.fromEntries(sourceRows.map(r => [r.source, Number(r.count)]));
    const total    = statusRows.reduce((sum, r) => sum + Number(r.count), 0);

    return {
        unmatched:   byStatus.unmatched   ?? 0,
        suggested:   byStatus.suggested   ?? 0,
        confirmed:   byStatus.confirmed   ?? 0,
        ignored:     byStatus.ignored     ?? 0,
        total,
        fio_bank:    bySource.fio_bank    ?? 0,
        file_import: bySource.file_import ?? 0,
        cash:        bySource.cash        ?? 0,
        profiles:    profileRows.map(r => ({ id: r.profileId, name: r.profileName, count: Number(r.count) })),
    };
}

// ── Rekonciliační akce (pro UI Etapy B/C) ────────────────────────────────────

/** Ruční potvrzení jednoduché alokace (1:1 párování) */
export async function confirmSingleAllocation(input: {
    ledgerId:  number;
    contribId: number;
    memberId:  number;
}): Promise<{ error: string } | { success: true }> {
    const session = await auth();
    const confirmedBy = session?.user?.email ?? "unknown";
    const db = getDb();

    const [ledger] = await db.select().from(paymentLedger).where(eq(paymentLedger.id, input.ledgerId));
    if (!ledger) return { error: "Platba nenalezena" };
    if (ledger.reconciliationStatus === "confirmed") return { error: "Platba je již potvrzena" };

    await db.transaction(async (tx) => {
        // Odstraň případné suggested alokace
        await tx.delete(paymentAllocations).where(eq(paymentAllocations.ledgerId, input.ledgerId));

        // Vytvoř potvrzenou alokaci (ledger.amount je string z numeric, předáme přímo)
        await tx.insert(paymentAllocations).values({
            ledgerId:    input.ledgerId,
            contribId:   input.contribId,
            memberId:    input.memberId,
            amount:      ledger.amount,   // string z numeric — Drizzle INSERT OK
            isSuggested: false,
            confirmedBy,
            confirmedAt: new Date(),
            createdBy:   confirmedBy,
        });

        // Nastav ledger na confirmed
        await tx.update(paymentLedger)
            .set({ reconciliationStatus: "confirmed", updatedAt: new Date() })
            .where(eq(paymentLedger.id, input.ledgerId));
    });

    revalidatePath("/dashboard/payments");
    return { success: true };
}

/** Atomický split platby na více předpisů */
export async function splitPayment(input: {
    ledgerId: number;
    parts: Array<{ contribId: number; memberId: number; amount: number; note?: string }>;
}): Promise<{ error: string } | { success: true }> {
    const session = await auth();
    const confirmedBy = session?.user?.email ?? "unknown";
    const db = getDb();

    const [ledger] = await db.select().from(paymentLedger).where(eq(paymentLedger.id, input.ledgerId));
    if (!ledger) return { error: "Platba nenalezena" };
    if (ledger.reconciliationStatus === "confirmed") return { error: "Platba je již potvrzena — nejdřív odpárujte" };

    const partsTotal = input.parts.reduce((sum, p) => sum + p.amount, 0);
    const ledgerAmount = Number(ledger.amount);
    if (Math.abs(partsTotal - ledgerAmount) > 0.001) {
        return { error: `Součet částí (${partsTotal} Kč) se nerovná celkové částce (${ledgerAmount} Kč)` };
    }
    if (input.parts.length === 0) return { error: "Zadejte alespoň jeden řádek" };

    await db.transaction(async (tx) => {
        // Odstraň stávající alokace
        await tx.delete(paymentAllocations).where(eq(paymentAllocations.ledgerId, input.ledgerId));

        // Vlož nové alokace
        for (const part of input.parts) {
            await tx.insert(paymentAllocations).values({
                ledgerId:    input.ledgerId,
                contribId:   part.contribId,
                memberId:    part.memberId,
                amount:      dec(part.amount),
                note:        part.note ?? null,
                isSuggested: false,
                confirmedBy,
                confirmedAt: new Date(),
                createdBy:   confirmedBy,
            });
        }

        // Nastav ledger na confirmed
        await tx.update(paymentLedger)
            .set({ reconciliationStatus: "confirmed", updatedAt: new Date() })
            .where(eq(paymentLedger.id, input.ledgerId));
    });

    revalidatePath("/dashboard/payments");
    return { success: true };
}

/** Odpárování potvrzené platby (vyžaduje potvrzení v UI) */
export async function unmatchPayment(ledgerId: number): Promise<{ error: string } | { success: true }> {
    await auth();
    const db = getDb();

    const [ledger] = await db.select().from(paymentLedger).where(eq(paymentLedger.id, ledgerId));
    if (!ledger) return { error: "Platba nenalezena" };

    await db.transaction(async (tx) => {
        await tx.delete(paymentAllocations).where(eq(paymentAllocations.ledgerId, ledgerId));
        await tx.update(paymentLedger)
            .set({ reconciliationStatus: "unmatched", updatedAt: new Date() })
            .where(eq(paymentLedger.id, ledgerId));
    });

    revalidatePath("/dashboard/payments");
    return { success: true };
}

/** Ignorace platby (bez párování, ale viditelná v historii) */
export async function ignorePayment(
    ledgerId: number,
    note: string | null,
): Promise<{ error: string } | { success: true }> {
    await auth();
    const db = getDb();

    await db.update(paymentLedger)
        .set({ reconciliationStatus: "ignored", note, updatedAt: new Date() })
        .where(eq(paymentLedger.id, ledgerId));

    revalidatePath("/dashboard/payments");
    return { success: true };
}

// ── Výpis ledger záznamů ──────────────────────────────────────────────────────

export async function loadLedgerRows(filters: {
    year?:      number;
    status?:    ReconciliationStatus;
    source?:    "fio_bank" | "file_import" | "cash";
    profileId?: number;
}): Promise<LedgerRow[]> {
    const db = getDb();

    const conditions = [];
    if (filters.year) {
        conditions.push(sql`EXTRACT(YEAR FROM ${paymentLedger.paidAt}) = ${filters.year}`);
    }
    if (filters.status)    conditions.push(eq(paymentLedger.reconciliationStatus, filters.status));
    if (filters.source)    conditions.push(eq(paymentLedger.sourceType, filters.source));
    if (filters.profileId) conditions.push(eq(bankImportTransactions.profileId, filters.profileId));

    const rows = await db
        .select({
            id:                   paymentLedger.id,
            sourceType:           paymentLedger.sourceType,
            profileId:            bankImportTransactions.profileId,
            profileName:          importProfiles.name,
            paidAt:               paymentLedger.paidAt,
            amount:               paymentLedger.amount,
            variableSymbol:       paymentLedger.variableSymbol,
            counterpartyName:     paymentLedger.counterpartyName,
            counterpartyAccount:  paymentLedger.counterpartyAccount,
            message:              paymentLedger.message,
            note:                 paymentLedger.note,
            reconciliationStatus: paymentLedger.reconciliationStatus,
            createdAt:            paymentLedger.createdAt,
        })
        .from(paymentLedger)
        .leftJoin(bankImportTransactions, eq(paymentLedger.bankImportTxId, bankImportTransactions.id))
        .leftJoin(importProfiles, eq(bankImportTransactions.profileId, importProfiles.id))
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(sql`${paymentLedger.paidAt} DESC`);

    if (rows.length === 0) return [];

    // Načti alokace pro všechny ledger záznamy
    const ledgerIds = rows.map(r => r.id);
    const allocations = await db
        .select({
            ledgerId:    paymentAllocations.ledgerId,
            id:          paymentAllocations.id,
            contribId:   paymentAllocations.contribId,
            memberId:    paymentAllocations.memberId,
            memberName:  members.fullName,
            amount:      paymentAllocations.amount,
            isSuggested: paymentAllocations.isSuggested,
            confirmedBy: paymentAllocations.confirmedBy,
        })
        .from(paymentAllocations)
        .innerJoin(members, eq(paymentAllocations.memberId, members.id))
        .where(inArray(paymentAllocations.ledgerId, ledgerIds));

    const allocsByLedger = new Map<number, typeof allocations>();
    for (const a of allocations) {
        const existing = allocsByLedger.get(a.ledgerId) ?? [];
        existing.push(a);
        allocsByLedger.set(a.ledgerId, existing);
    }

    return rows.map(row => ({
        ...row,
        amount:      Number(row.amount),
        profileId:   row.profileId   ?? null,
        profileName: row.profileName ?? null,
        paidAt:      row.paidAt as unknown as string,
        createdAt:   (row.createdAt as unknown as Date).toISOString(),
        reconciliationStatus: row.reconciliationStatus as ReconciliationStatus,
        allocations: (allocsByLedger.get(row.id) ?? []).map(a => ({
            id:          a.id,
            contribId:   a.contribId,
            memberId:    a.memberId,
            memberName:  a.memberName,
            amount:      Number(a.amount),                      // numeric → number
            isSuggested: a.isSuggested,
            confirmedBy: a.confirmedBy,
        })),
    }));
}

// ── Roky dostupné v ledgeru ───────────────────────────────────────────────────

export async function loadLedgerYears(): Promise<number[]> {
    const db = getDb();
    const rows = await db.execute(
        sql`SELECT DISTINCT EXTRACT(YEAR FROM paid_at)::int AS year FROM app.payment_ledger ORDER BY year DESC`
    );
    return (rows as unknown as Array<{ year: number }>).map(r => r.year);
}

// ── Členové pro manuální párování ────────────────────────────────────────────

export type MemberMatchCandidate = {
    memberId:       number;
    fullName:       string;
    variableSymbol: number | null;
    contribId:      number | null;
    amountTotal:    number | null;
    alreadyPaid:    number;
    remaining:      number | null;
};

/**
 * Vrátí seznam členů s jejich předpisem pro daný rok.
 * Použití: match modal — výběr člena + předpisu při ručním párování.
 */
export async function loadMembersForMatch(year: number): Promise<MemberMatchCandidate[]> {
    const db = getDb();

    // Členové + jejich předpis pro rok (LEFT JOIN — člen může nemít předpis)
    const rows = await db
        .select({
            memberId:       members.id,
            fullName:       members.fullName,
            variableSymbol: members.variableSymbol,
            contribId:      memberContributions.id,
            amountTotal:    memberContributions.amountTotal,
        })
        .from(members)
        .leftJoin(
            memberContributions,
            and(
                eq(memberContributions.memberId, members.id),
                sql`EXISTS (
                    SELECT 1 FROM app.contribution_periods cp
                    WHERE cp.id = ${memberContributions.periodId}
                    AND cp.year = ${year}
                )`
            )
        )
        .orderBy(members.fullName);

    if (rows.length === 0) return [];

    // Zjisti kolik je již potvrzeně alokováno na každý předpis
    const contribIds = rows.map(r => r.contribId).filter((id): id is number => id !== null);
    const allocMap = new Map<number, number>();

    if (contribIds.length > 0) {
        const allocRows = await db
            .select({
                contribId: paymentAllocations.contribId,
                paid:      sql<number>`coalesce(sum(${paymentAllocations.amount}), 0)`,
            })
            .from(paymentAllocations)
            .innerJoin(paymentLedger, eq(paymentAllocations.ledgerId, paymentLedger.id))
            .where(and(
                inArray(paymentAllocations.contribId, contribIds),
                eq(paymentLedger.reconciliationStatus, "confirmed"),
            ))
            .groupBy(paymentAllocations.contribId);

        for (const a of allocRows) {
            allocMap.set(a.contribId, Number(a.paid));
        }
    }

    return rows.map(r => {
        const alreadyPaid = r.contribId ? (allocMap.get(r.contribId) ?? 0) : 0;
        const remaining   = r.amountTotal !== null ? (r.amountTotal - alreadyPaid) : null;
        return {
            memberId:       r.memberId,
            fullName:       r.fullName,
            variableSymbol: r.variableSymbol,
            contribId:      r.contribId,
            amountTotal:    r.amountTotal,
            alreadyPaid,
            remaining,
        };
    });
}
