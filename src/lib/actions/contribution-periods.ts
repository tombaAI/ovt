"use server";

import { getDb } from "@/lib/db";
import {
    contributionPeriods, memberContributions, members, boats,
} from "@/db/schema";
import { eq, and, lte, isNull, or, inArray, sql } from "drizzle-orm";
import { auth } from "@/auth";
import { revalidatePath } from "next/cache";
import { getBrigadeMemberIdsByYear } from "./brigades";

export type PeriodFormData = {
    year: number;
    amountBase: number;
    amountBoat1: number;
    amountBoat2: number;
    amountBoat3: number;
    discountCommittee: number;
    discountTom: number;
    brigadeSurcharge: number;
    dueDate: string | null;
    bankAccount: string;   // "2701772934/2010" | "1024298088/3030" | "351416278/0300"
};

export type PreparePrescriptionsResult =
    | { error: string }
    | { success: true; generated: number; skipped: number };

/**
 * Upsertuje contribution_period a vygeneruje member_contributions pro všechny
 * aktivní členy daného roku. Již existující předpisy přeskočí (idempotentní).
 *
 * Logika výpočtu předpisu na člena:
 *  - amountBase: základ z období
 *  - amountBoat1/2/3: počet lodí v dané mříži × cena za loď
 *  - discountCommittee: přeneseno z loňska (jako záporná hodnota)
 *  - discountTom: přeneseno z loňska (záporná hodnota)
 *  - discountIndividual: přeneseno z loňska, jen pokud discountIndividualValidUntil >= rok
 *  - brigadeSurcharge: penále, pokud člen nemá brigádu z předchozího roku
 */
export async function preparePrescriptions(
    data: PeriodFormData,
): Promise<PreparePrescriptionsResult> {
    const session = await auth();
    if (!session?.user) return { error: "Nepřihlášen" };

    const db = getDb();
    const { year } = data;
    const yearStart = `${year}-01-01`;
    const yearEnd   = `${year}-12-31`;

    try {
        // ── 1. Upsert periodo ────────────────────────────────────────────────
        const [period] = await db
            .insert(contributionPeriods)
            .values({
                year:               data.year,
                amountBase:         data.amountBase,
                amountBoat1:        data.amountBoat1,
                amountBoat2:        data.amountBoat2,
                amountBoat3:        data.amountBoat2,   // 3. loď = stejná cena jako 2.
                discountCommittee:  data.discountCommittee,
                discountTom:        data.discountTom,
                brigadeSurcharge:   data.brigadeSurcharge,
                dueDate:            data.dueDate,
                bankAccount:        data.bankAccount,
                status:             "draft",
            })
            .onConflictDoUpdate({
                target: contributionPeriods.year,
                set: {
                    amountBase:        data.amountBase,
                    amountBoat1:       data.amountBoat1,
                    amountBoat2:       data.amountBoat2,
                    amountBoat3:       data.amountBoat2,   // 3. loď = stejná cena jako 2.
                    discountCommittee: data.discountCommittee,
                    discountTom:       data.discountTom,
                    brigadeSurcharge:  data.brigadeSurcharge,
                    dueDate:           data.dueDate,
                    bankAccount:       data.bankAccount,
                },
            })
            .returning();

        // ── 2. Aktivní členové v daném roce ──────────────────────────────────
        const activeMembers = await db
            .select({ id: members.id })
            .from(members)
            .where(and(
                lte(members.memberFrom, yearEnd),
                or(isNull(members.memberTo), sql`${members.memberTo} >= ${yearStart}`),
            ));

        if (activeMembers.length === 0) {
            revalidatePath("/dashboard/contributions");
            return { success: true, generated: 0, skipped: 0 };
        }

        const allMemberIds = activeMembers.map(m => m.id);

        // ── 3. Přeskočit již existující předpisy ─────────────────────────────
        const existingRows = await db
            .select({ memberId: memberContributions.memberId })
            .from(memberContributions)
            .where(eq(memberContributions.periodId, period.id));

        const existingSet  = new Set(existingRows.map(r => r.memberId));
        const newMemberIds = allMemberIds.filter(id => !existingSet.has(id));
        const skipped      = existingSet.size;

        if (newMemberIds.length === 0) {
            revalidatePath("/dashboard/contributions");
            return { success: true, generated: 0, skipped };
        }

        // ── 4. Lodě aktivní v daném roce — počet na člena ────────────────────
        // Cena nezáleží na velikosti/mříži, ale na pořadí:
        //   1. loď → amountBoat1, 2. loď → amountBoat2, 3. loď → amountBoat3
        // Počítáme jen lodě fyzicky přítomné v krakorcích (isPresent = true)
        const boatRows = await db
            .select({ ownerId: boats.ownerId })
            .from(boats)
            .where(and(
                inArray(boats.ownerId, newMemberIds),
                eq(boats.isPresent, true),
                or(isNull(boats.storedFrom), lte(boats.storedFrom, yearEnd)),
                or(isNull(boats.storedTo),   sql`${boats.storedTo} >= ${yearStart}`),
            ));

        const boatCountByMember = boatRows.reduce((acc, b) => {
            if (!b.ownerId) return acc;
            acc[b.ownerId] = (acc[b.ownerId] ?? 0) + 1;
            return acc;
        }, {} as Record<number, number>);

        // ── 5. Brigáda z předchozího roku ────────────────────────────────────
        const brigadeParticipants = await getBrigadeMemberIdsByYear(year - 1);

        // ── 6. Příznaky výboru/TOM z members tabulky (trvalé vlastnosti člena) ──
        const memberFlagRows = await db
            .select({ id: members.id, isCommitteeMember: members.isCommitteeMember, isTomLeader: members.isTomLeader })
            .from(members)
            .where(inArray(members.id, newMemberIds));
        const memberFlagsById = new Map(memberFlagRows.map(m => [m.id, m]));

        // ── 7. Přenosy individuální slevy z loňského roku ────────────────────
        const [prevPeriod] = await db
            .select({ id: contributionPeriods.id })
            .from(contributionPeriods)
            .where(eq(contributionPeriods.year, year - 1));

        const prevContribs = prevPeriod
            ? await db
                .select({
                    memberId:                    memberContributions.memberId,
                    discountIndividual:          memberContributions.discountIndividual,
                    discountIndividualNote:      memberContributions.discountIndividualNote,
                    discountIndividualValidUntil: memberContributions.discountIndividualValidUntil,
                })
                .from(memberContributions)
                .where(and(
                    eq(memberContributions.periodId, prevPeriod.id),
                    inArray(memberContributions.memberId, newMemberIds),
                ))
            : [];

        const prevByMember = new Map(prevContribs.map(c => [c.memberId, c]));

        // ── 8. Výpočet a vložení předpisů ────────────────────────────────────
        const toInsert = newMemberIds.map(memberId => {
            const prev      = prevByMember.get(memberId);
            const flags     = memberFlagsById.get(memberId);
            const boatCount = boatCountByMember[memberId] ?? 0;

            // Slevy výbor/TOM: z trvalých příznaků člena (ne z loňských předpisů)
            // Sleva výbor má přednost — pokud ji člen má, sleva TOM se do součtu nezapočítá
            const discountCommittee = flags?.isCommitteeMember ? -period.discountCommittee : null;
            const discountTom       = flags?.isTomLeader       ? -period.discountTom       : null;
            const effectiveDiscountTom = discountCommittee ? null : discountTom;

            // Individuální sleva: přenést z loňska, pokud validUntil >= letošní rok
            const hasValidIndividual =
                prev?.discountIndividual != null &&
                (prev.discountIndividualValidUntil ?? 0) >= year;
            const discountIndividual          = hasValidIndividual ? prev!.discountIndividual          : null;
            const discountIndividualNote      = hasValidIndividual ? prev!.discountIndividualNote      : null;
            const discountIndividualValidUntil = hasValidIndividual ? prev!.discountIndividualValidUntil : null;

            // Příplatky za lodě: 1. loď → amountBoat1, 2. a každá další → amountBoat2
            const amountBoat1 = boatCount >= 1 ? period.amountBoat1 : 0;
            const amountBoat2 = boatCount >= 2 ? period.amountBoat2 : 0;
            const amountBoat3 = boatCount >= 3 ? period.amountBoat2 : 0; // stejná sazba jako 2.

            // Penále za brigádu: uplatní se pokud člen NEMÁ brigádu z minulého roku
            const didBrigade      = brigadeParticipants.has(memberId);
            const brigadeSurcharge = didBrigade ? 0 : period.brigadeSurcharge;

            const amountTotal =
                period.amountBase +
                amountBoat1 + amountBoat2 + amountBoat3 +
                (discountCommittee ?? 0) +
                (effectiveDiscountTom ?? 0) +
                (discountIndividual ?? 0) +
                brigadeSurcharge;

            return {
                memberId,
                periodId:                    period.id,
                amountBase:                  period.amountBase,
                amountBoat1:                 amountBoat1 || null,
                amountBoat2:                 amountBoat2 || null,
                amountBoat3:                 amountBoat3 || null,
                discountCommittee,
                discountTom,
                discountIndividual,
                discountIndividualNote,
                discountIndividualValidUntil,
                brigadeSurcharge:            brigadeSurcharge || null,
                amountTotal,
            };
        });

        if (toInsert.length > 0) {
            // Batch insert po 100 záznamy (ochrana před extrémně velkými payloady)
            const BATCH = 100;
            for (let i = 0; i < toInsert.length; i += BATCH) {
                await db.insert(memberContributions).values(toInsert.slice(i, i + BATCH));
            }
        }

        revalidatePath("/dashboard/contributions");
        return { success: true, generated: toInsert.length, skipped };

    } catch (e) {
        console.error("[preparePrescriptions]", e);
        return { error: "Chyba při generování předpisů" };
    }
}

/**
 * Vrátí výchozí nastavení pro dialog — z existujícího období nebo z loňska.
 */
export async function getDefaultsFromPrevYear(year: number): Promise<Partial<PeriodFormData>> {
    const db = getDb();

    const [existing] = await db
        .select()
        .from(contributionPeriods)
        .where(eq(contributionPeriods.year, year));

    const source = existing ?? await db
        .select()
        .from(contributionPeriods)
        .where(eq(contributionPeriods.year, year - 1))
        .then(rows => rows[0]);

    if (!source) {
        return {
            year,
            amountBase:        1000,
            amountBoat1:       0,
            amountBoat2:       0,
            amountBoat3:       0,
            discountCommittee: 0,
            discountTom:       0,
            brigadeSurcharge:  0,
            dueDate:           null,
            bankAccount:       "2701772934/2010",
        };
    }

    return {
        year,
        amountBase:        source.amountBase,
        amountBoat1:       source.amountBoat1,
        amountBoat2:       source.amountBoat2,
        amountBoat3:       source.amountBoat3,
        discountCommittee: source.discountCommittee,
        discountTom:       source.discountTom,
        brigadeSurcharge:  source.brigadeSurcharge,
        bankAccount:       source.bankAccount,
        // Datum splatnosti přenášíme jen pokud jde o existující záznam téhož roku
        dueDate:           existing ? (existing.dueDate as unknown as string | null) : null,
    };
}

// ── Smazat všechny předpisy období ───────────────────────────────────────────

/**
 * Smaže všechny member_contributions pro dané období.
 * Povoleno jen pokud je období ve stavu "draft".
 */
export async function deleteAllPrescriptions(
    periodId: number,
): Promise<{ error: string } | { success: true; deleted: number }> {
    const session = await auth();
    if (!session?.user) return { error: "Nepřihlášen" };

    const db = getDb();
    try {
        const [period] = await db
            .select({ status: contributionPeriods.status })
            .from(contributionPeriods)
            .where(eq(contributionPeriods.id, periodId));

        if (!period) return { error: "Období nenalezeno" };
        if (period.status !== "draft") return { error: "Smazání je povoleno jen ve stavu Příprava" };

        // Blokovat smazání pokud byl u jakéhokoli předpisu odeslán email
        const [emailSentCheck] = await db
            .select({ id: memberContributions.id })
            .from(memberContributions)
            .where(and(eq(memberContributions.periodId, periodId), eq(memberContributions.emailSent, true)));

        if (emailSentCheck) return { error: "Nelze smazat — u některých předpisů byl odeslán email" };

        const deleted = await db
            .delete(memberContributions)
            .where(eq(memberContributions.periodId, periodId))
            .returning({ id: memberContributions.id });

        revalidatePath("/dashboard/contributions");
        return { success: true, deleted: deleted.length };
    } catch (e) {
        console.error("[deleteAllPrescriptions]", e);
        return { error: "Chyba při mazání" };
    }
}

// ── Upravit částky jednoho předpisu ──────────────────────────────────────────

export type PrescriptionAmounts = {
    amountBase: number;
    amountBoat1: number;   // 0 = žádná
    amountBoat2: number;
    amountBoat3: number;
    discountCommittee: number;   // zadáno jako kladné číslo, uloženo záporně
    discountTom: number;
    discountIndividual: number;
    brigadeSurcharge: number;
};

/**
 * Aktualizuje složky předpisu a přepočítá amountTotal.
 * Povoleno jen pokud je příslušné období ve stavu "draft".
 */
export async function updatePrescriptionAmounts(
    contribId: number,
    data: PrescriptionAmounts,
): Promise<{ error: string } | { success: true }> {
    const session = await auth();
    if (!session?.user) return { error: "Nepřihlášen" };

    const db = getDb();
    try {
        const [contrib] = await db
            .select({
                id:       memberContributions.id,
                periodId: memberContributions.periodId,
            })
            .from(memberContributions)
            .where(eq(memberContributions.id, contribId));

        if (!contrib) return { error: "Předpis nenalezen" };

        const [period] = await db
            .select({ status: contributionPeriods.status })
            .from(contributionPeriods)
            .where(eq(contributionPeriods.id, contrib.periodId));

        if (!period) return { error: "Období nenalezeno" };
        if (period.status !== "draft") return { error: "Úprava je povolena jen ve stavu Příprava" };

        // Slevy se ukládají jako záporná čísla
        // Sleva výbor má přednost — pokud ji člen má, sleva TOM se do součtu nezapočítá
        const discountCommittee  = data.discountCommittee  > 0 ? -data.discountCommittee  : null;
        const discountTom        = data.discountTom        > 0 ? -data.discountTom        : null;
        const discountIndividual = data.discountIndividual > 0 ? -data.discountIndividual : null;
        const effectiveDiscountTom = discountCommittee ? null : discountTom;

        const amountTotal =
            data.amountBase +
            data.amountBoat1 + data.amountBoat2 + data.amountBoat3 +
            (discountCommittee     ?? 0) +
            (effectiveDiscountTom  ?? 0) +
            (discountIndividual    ?? 0) +
            data.brigadeSurcharge;

        await db.update(memberContributions).set({
            amountBase:        data.amountBase,
            amountBoat1:       data.amountBoat1 || null,
            amountBoat2:       data.amountBoat2 || null,
            amountBoat3:       data.amountBoat3 || null,
            discountCommittee,
            discountTom,
            discountIndividual,
            brigadeSurcharge:  data.brigadeSurcharge || null,
            amountTotal,
        }).where(eq(memberContributions.id, contribId));

        revalidatePath("/dashboard/contributions");
        return { success: true };
    } catch (e) {
        console.error("[updatePrescriptionAmounts]", e);
        return { error: "Chyba při ukládání" };
    }
}

// ── Pomocná funkce: přepočet amountTotal ─────────────────────────────────────

function recalcTotal(c: {
    amountBase:         number | null;
    amountBoat1:        number | null;
    amountBoat2:        number | null;
    amountBoat3:        number | null;
    discountCommittee:  number | null;
    discountTom:        number | null;
    discountIndividual: number | null;
    brigadeSurcharge:   number | null;
}): number {
    // Sleva výbor má přednost před TOM
    const effectiveTom = c.discountCommittee ? null : c.discountTom;
    return (
        (c.amountBase         ?? 0) +
        (c.amountBoat1        ?? 0) +
        (c.amountBoat2        ?? 0) +
        (c.amountBoat3        ?? 0) +
        (c.discountCommittee  ?? 0) +
        (effectiveTom         ?? 0) +
        (c.discountIndividual ?? 0) +
        (c.brigadeSurcharge   ?? 0)
    );
}

// ── Přidat loď k předpisu ─────────────────────────────────────────────────────

export async function addBoatToContrib(
    contribId: number,
): Promise<{ error: string } | { success: true }> {
    const session = await auth();
    if (!session?.user) return { error: "Nepřihlášen" };

    const db = getDb();
    try {
        const [c] = await db
            .select({
                id:                 memberContributions.id,
                periodId:           memberContributions.periodId,
                amountBase:         memberContributions.amountBase,
                amountBoat1:        memberContributions.amountBoat1,
                amountBoat2:        memberContributions.amountBoat2,
                amountBoat3:        memberContributions.amountBoat3,
                discountCommittee:  memberContributions.discountCommittee,
                discountTom:        memberContributions.discountTom,
                discountIndividual: memberContributions.discountIndividual,
                brigadeSurcharge:   memberContributions.brigadeSurcharge,
            })
            .from(memberContributions)
            .where(eq(memberContributions.id, contribId));

        if (!c) return { error: "Předpis nenalezen" };

        // Zjistit ceny lodí z období
        const [period] = await db
            .select({ amountBoat1: contributionPeriods.amountBoat1, amountBoat2: contributionPeriods.amountBoat2 })
            .from(contributionPeriods)
            .where(eq(contributionPeriods.id, c.periodId));

        if (!period) return { error: "Období nenalezeno" };

        const update: Partial<typeof c> = {};
        if (!c.amountBoat1) {
            update.amountBoat1 = period.amountBoat1;
        } else if (!c.amountBoat2) {
            update.amountBoat2 = period.amountBoat2;
        } else if (!c.amountBoat3) {
            update.amountBoat3 = period.amountBoat2;   // 3. loď = stejná sazba jako 2.
        } else {
            return { error: "Člen má již 3 lodě" };
        }

        const updated = { ...c, ...update };
        const amountTotal = recalcTotal(updated);

        await db.update(memberContributions)
            .set({ ...update, amountTotal })
            .where(eq(memberContributions.id, contribId));

        revalidatePath("/dashboard/contributions");
        return { success: true };
    } catch (e) {
        console.error("[addBoatToContrib]", e);
        return { error: "Chyba při ukládání" };
    }
}

// ── Odebrat loď z předpisu ────────────────────────────────────────────────────

export async function removeBoatFromContrib(
    contribId: number,
): Promise<{ error: string } | { success: true }> {
    const session = await auth();
    if (!session?.user) return { error: "Nepřihlášen" };

    const db = getDb();
    try {
        const [c] = await db
            .select({
                id:                 memberContributions.id,
                periodId:           memberContributions.periodId,
                amountBase:         memberContributions.amountBase,
                amountBoat1:        memberContributions.amountBoat1,
                amountBoat2:        memberContributions.amountBoat2,
                amountBoat3:        memberContributions.amountBoat3,
                discountCommittee:  memberContributions.discountCommittee,
                discountTom:        memberContributions.discountTom,
                discountIndividual: memberContributions.discountIndividual,
                brigadeSurcharge:   memberContributions.brigadeSurcharge,
            })
            .from(memberContributions)
            .where(eq(memberContributions.id, contribId));

        if (!c) return { error: "Předpis nenalezen" };

        const update: Partial<typeof c> = {};
        if (c.amountBoat3) {
            update.amountBoat3 = null;
        } else if (c.amountBoat2) {
            update.amountBoat2 = null;
        } else if (c.amountBoat1) {
            update.amountBoat1 = null;
        } else {
            return { error: "Žádná loď k odebrání" };
        }

        const updated = { ...c, ...update };
        const amountTotal = recalcTotal(updated);

        await db.update(memberContributions)
            .set({ ...update, amountTotal })
            .where(eq(memberContributions.id, contribId));

        revalidatePath("/dashboard/contributions");
        return { success: true };
    } catch (e) {
        console.error("[removeBoatFromContrib]", e);
        return { error: "Chyba při ukládání" };
    }
}

// ── Individuální sleva ────────────────────────────────────────────────────────

export type IndividualDiscountData = {
    amount:     number;         // kladné číslo zadané adminem; 0 = zrušit slevu
    note:       string | null;
    validUntil: number | null;  // rok platnosti (např. 2028)
};

export async function setContribIndividualDiscount(
    contribId: number,
    data: IndividualDiscountData,
): Promise<{ error: string } | { success: true }> {
    const session = await auth();
    if (!session?.user) return { error: "Nepřihlášen" };

    const db = getDb();
    try {
        const [c] = await db
            .select({
                id:                 memberContributions.id,
                amountBase:         memberContributions.amountBase,
                amountBoat1:        memberContributions.amountBoat1,
                amountBoat2:        memberContributions.amountBoat2,
                amountBoat3:        memberContributions.amountBoat3,
                discountCommittee:  memberContributions.discountCommittee,
                discountTom:        memberContributions.discountTom,
                brigadeSurcharge:   memberContributions.brigadeSurcharge,
            })
            .from(memberContributions)
            .where(eq(memberContributions.id, contribId));

        if (!c) return { error: "Předpis nenalezen" };

        const discountIndividual = data.amount > 0 ? -data.amount : null;
        const amountTotal = recalcTotal({ ...c, discountIndividual });

        await db.update(memberContributions).set({
            discountIndividual,
            discountIndividualNote:      data.amount > 0 ? (data.note ?? null) : null,
            discountIndividualValidUntil: data.amount > 0 ? (data.validUntil ?? null) : null,
            amountTotal,
        }).where(eq(memberContributions.id, contribId));

        revalidatePath("/dashboard/contributions");
        return { success: true };
    } catch (e) {
        console.error("[setContribIndividualDiscount]", e);
        return { error: "Chyba při ukládání" };
    }
}

// ── Přepočítat předpis podle aktuálního stavu člena ──────────────────────────

export type RecalcProposed = {
    amountBase:        number;
    amountBoat1:       number | null;
    amountBoat2:       number | null;
    amountBoat3:       number | null;
    discountCommittee: number | null;
    discountTom:       number | null;
    discountIndividual: number | null;
    brigadeSurcharge:  number | null;
    amountTotal:       number;
};

/** Sdílená výpočetní logika — vrátí navrhované hodnoty bez ukládání. */
async function computeRecalc(contribId: number, db: ReturnType<typeof getDb>): Promise<
    { error: string } | { proposed: RecalcProposed; discountIndividual: number | null }
> {
    const [c] = await db
        .select({
            memberId:            memberContributions.memberId,
            periodId:            memberContributions.periodId,
            discountIndividual:  memberContributions.discountIndividual,
        })
        .from(memberContributions)
        .where(eq(memberContributions.id, contribId));

    if (!c) return { error: "Předpis nenalezen" };

    const [period] = await db
        .select({
            year:              contributionPeriods.year,
            amountBase:        contributionPeriods.amountBase,
            amountBoat1:       contributionPeriods.amountBoat1,
            amountBoat2:       contributionPeriods.amountBoat2,
            discountCommittee: contributionPeriods.discountCommittee,
            discountTom:       contributionPeriods.discountTom,
            brigadeSurcharge:  contributionPeriods.brigadeSurcharge,
        })
        .from(contributionPeriods)
        .where(eq(contributionPeriods.id, c.periodId));

    if (!period) return { error: "Období nenalezeno" };

    const yearStart = `${period.year}-01-01`;
    const yearEnd   = `${period.year}-12-31`;

    const [member] = await db
        .select({ isCommitteeMember: members.isCommitteeMember, isTomLeader: members.isTomLeader })
        .from(members)
        .where(eq(members.id, c.memberId));

    if (!member) return { error: "Člen nenalezen" };

    const boatRows = await db
        .select({ id: boats.id })
        .from(boats)
        .where(and(
            eq(boats.ownerId, c.memberId),
            eq(boats.isPresent, true),
            or(isNull(boats.storedFrom), lte(boats.storedFrom, yearEnd)),
            or(isNull(boats.storedTo),   sql`${boats.storedTo} >= ${yearStart}`),
        ));
    const boatCount = boatRows.length;

    const brigadeSet = await getBrigadeMemberIdsByYear(period.year - 1);
    const didBrigade = brigadeSet.has(c.memberId);

    const discountCommittee    = member.isCommitteeMember ? -period.discountCommittee : null;
    const discountTom          = member.isTomLeader       ? -period.discountTom       : null;
    const effectiveDiscountTom = discountCommittee ? null : discountTom;
    const brigadeSurcharge     = didBrigade ? 0 : period.brigadeSurcharge;

    const amountBoat1 = boatCount >= 1 ? period.amountBoat1 : null;
    const amountBoat2 = boatCount >= 2 ? period.amountBoat2 : null;
    const amountBoat3 = boatCount >= 3 ? period.amountBoat2 : null;

    const amountTotal =
        period.amountBase +
        (amountBoat1 ?? 0) + (amountBoat2 ?? 0) + (amountBoat3 ?? 0) +
        (discountCommittee   ?? 0) +
        (effectiveDiscountTom ?? 0) +
        (c.discountIndividual ?? 0) +
        brigadeSurcharge;

    return {
        proposed: {
            amountBase: period.amountBase,
            amountBoat1,
            amountBoat2,
            amountBoat3,
            discountCommittee,
            discountTom,
            discountIndividual: c.discountIndividual,
            brigadeSurcharge:   brigadeSurcharge || null,
            amountTotal,
        },
        discountIndividual: c.discountIndividual,
    };
}

/**
 * Vrátí navrhované přepočítané hodnoty bez uložení.
 * Používá se pro preview v potvrzovacím dialogu.
 */
export async function previewRecalcContrib(
    contribId: number,
): Promise<{ error: string } | { success: true; proposed: RecalcProposed }> {
    const session = await auth();
    if (!session?.user) return { error: "Nepřihlášen" };

    const db = getDb();
    try {
        const result = await computeRecalc(contribId, db);
        if ("error" in result) return result;
        return { success: true, proposed: result.proposed };
    } catch (e) {
        console.error("[previewRecalcContrib]", e);
        return { error: "Chyba při výpočtu" };
    }
}

/**
 * Uloží přepočítaný předpis (po potvrzení uživatelem).
 * Zachová individuální slevu, vše ostatní přepočítá znovu.
 * Povoleno i pro revidované/odeslané předpisy (po potvrzení opravy chyby).
 */
export async function recalcContribForMember(
    contribId: number,
): Promise<{ error: string } | { success: true }> {
    const session = await auth();
    if (!session?.user) return { error: "Nepřihlášen" };

    const db = getDb();
    try {
        const result = await computeRecalc(contribId, db);
        if ("error" in result) return result;

        const { proposed } = result;
        await db.update(memberContributions).set({
            amountBase:        proposed.amountBase,
            amountBoat1:       proposed.amountBoat1,
            amountBoat2:       proposed.amountBoat2,
            amountBoat3:       proposed.amountBoat3,
            discountCommittee: proposed.discountCommittee,
            discountTom:       proposed.discountTom,
            brigadeSurcharge:  proposed.brigadeSurcharge,
            amountTotal:       proposed.amountTotal,
            // individuální sleva, reviewed, emailSent — beze změny
        }).where(eq(memberContributions.id, contribId));

        revalidatePath("/dashboard/contributions");
        return { success: true };
    } catch (e) {
        console.error("[recalcContribForMember]", e);
        return { error: "Chyba při přepočtu" };
    }
}
