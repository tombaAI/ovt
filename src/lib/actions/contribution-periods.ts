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
                amountBoat3:        data.amountBoat3,
                discountCommittee:  data.discountCommittee,
                discountTom:        data.discountTom,
                brigadeSurcharge:   data.brigadeSurcharge,
                dueDate:            data.dueDate,
                status:             "draft",
            })
            .onConflictDoUpdate({
                target: contributionPeriods.year,
                set: {
                    amountBase:        data.amountBase,
                    amountBoat1:       data.amountBoat1,
                    amountBoat2:       data.amountBoat2,
                    amountBoat3:       data.amountBoat3,
                    discountCommittee: data.discountCommittee,
                    discountTom:       data.discountTom,
                    brigadeSurcharge:  data.brigadeSurcharge,
                    dueDate:           data.dueDate,
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
        const boatRows = await db
            .select({ ownerId: boats.ownerId })
            .from(boats)
            .where(and(
                inArray(boats.ownerId, newMemberIds),
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

        // ── 6. Přenosy z loňského roku ───────────────────────────────────────
        const [prevPeriod] = await db
            .select({ id: contributionPeriods.id })
            .from(contributionPeriods)
            .where(eq(contributionPeriods.year, year - 1));

        const prevContribs = prevPeriod
            ? await db
                .select({
                    memberId:                    memberContributions.memberId,
                    discountCommittee:           memberContributions.discountCommittee,
                    discountTom:                 memberContributions.discountTom,
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

        // ── 7. Výpočet a vložení předpisů ────────────────────────────────────
        const toInsert = newMemberIds.map(memberId => {
            const prev      = prevByMember.get(memberId);
            const boatCount = boatCountByMember[memberId] ?? 0;

            // Slevy výbor/TOM: přenést, pokud člen měl slevu loni (znovu aplikovat letošní sazbu)
            const discountCommittee = prev?.discountCommittee
                ? -period.discountCommittee
                : null;
            const discountTom = prev?.discountTom
                ? -period.discountTom
                : null;

            // Individuální sleva: přenést, pokud validUntil >= letošní rok
            const hasValidIndividual =
                prev?.discountIndividual != null &&
                (prev.discountIndividualValidUntil ?? 0) >= year;
            const discountIndividual          = hasValidIndividual ? prev!.discountIndividual          : null;
            const discountIndividualNote      = hasValidIndividual ? prev!.discountIndividualNote      : null;
            const discountIndividualValidUntil = hasValidIndividual ? prev!.discountIndividualValidUntil : null;

            // Příplatky za lodě — podle pořadí, ne podle velikosti/mříže
            // Sloupce amountBoat1/2/3 uchovávají příplatek za 1./2./3. loď člena
            const amountBoat1 = boatCount >= 1 ? period.amountBoat1 : 0;
            const amountBoat2 = boatCount >= 2 ? period.amountBoat2 : 0;
            const amountBoat3 = boatCount >= 3 ? period.amountBoat3 : 0;

            // Penále za brigádu: uplatní se pokud člen NEMÁ brigádu z minulého roku
            const didBrigade      = brigadeParticipants.has(memberId);
            const brigadeSurcharge = didBrigade ? 0 : period.brigadeSurcharge;

            const amountTotal =
                period.amountBase +
                amountBoat1 + amountBoat2 + amountBoat3 +
                (discountCommittee ?? 0) +
                (discountTom ?? 0) +
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
        // Datum splatnosti přenášíme jen pokud jde o existující záznam téhož roku
        dueDate:           existing ? (existing.dueDate as unknown as string | null) : null,
    };
}
