import { getDb } from "@/lib/db";
import { members, memberContributions, contributionPeriods, importMembersTjBohemians } from "@/db/schema";
import { eq, asc, desc, and, lte, isNull, or, sql } from "drizzle-orm";
import { MembersClient } from "./members-client";
import { CONTRIBUTION_YEAR } from "@/lib/constants";
import type { SyncUpdatableField } from "@/lib/sync-config";

export type PeriodTab = {
    id: number;
    year: number;
};

export type MemberWithFlags = {
    id: number;
    fullName: string;
    userLogin: string | null;
    email: string | null;
    phone: string | null;
    variableSymbol: number | null;
    cskNumber: string | null;
    nickname: string | null;
    gender: string | null;
    address: string | null;
    birthDate: string | null;
    birthNumber: string | null;
    note: string | null;
    todoNote: string | null;
    // Member date range (always present)
    memberFrom: string;
    memberTo: string | null;
    memberToNote: string | null;
    // Per-year badge: set only when the event (entry/exit) falls in selectedYear
    fromDate: string | null;
    toDate: string | null;
    // Year-specific (from member_contributions — null if no contrib record)
    isCommittee: boolean;
    isTom: boolean;
    discountIndividual: number | null;
    isPaid: boolean | null;
    amountTotal: number | null;
    hasContrib: boolean;
    memberYears?: number[]; // only in all-years view
    hasTjDiffs: boolean;
};

function yearStart(year: number) { return `${year}-01-01`; }
function yearEnd(year: number)   { return `${year}-12-31`; }

function computeMemberYears(memberFrom: string, memberTo: string | null): number[] {
    const fromYear = parseInt(memberFrom.slice(0, 4));
    const toYear   = memberTo ? parseInt(memberTo.slice(0, 4)) : new Date().getFullYear();
    const years: number[] = [];
    for (let y = fromYear; y <= toYear; y++) years.push(y);
    return years;
}

export default async function MembersPage(props: {
    searchParams: Promise<{ year?: string }>;
}) {
    const { year: yearParam } = await props.searchParams;
    const db = getDb();

    const allPeriods = await db
        .select({ id: contributionPeriods.id, year: contributionPeriods.year })
        .from(contributionPeriods)
        .orderBy(desc(contributionPeriods.year));

    const isAllYears = yearParam === "all";
    const selectedYear = isAllYears ? 0 : (Number(yearParam) || CONTRIBUTION_YEAR);
    const period = isAllYears ? null : (allPeriods.find(p => p.year === selectedYear) ?? allPeriods[0] ?? null);

    let rows: MemberWithFlags[] = [];
    let currentYearDiscounts: { committee: number; tom: number } | null = null;

    if (period) {
        const [pd] = await db
            .select({ discountCommittee: contributionPeriods.discountCommittee, discountTom: contributionPeriods.discountTom })
            .from(contributionPeriods)
            .where(eq(contributionPeriods.id, period.id));
        if (pd) currentYearDiscounts = { committee: pd.discountCommittee, tom: pd.discountTom };
    }

    const actualYear = isAllYears ? 0 : (period?.year ?? selectedYear);

    // Načíst TJ import tabulku pro výpočet hasTjDiffs
    const tjAll = await db.select().from(importMembersTjBohemians);
    const tjByCsk  = new Map(tjAll.filter(r => r.cskNumber).map(r => [r.cskNumber!, r]));
    const tjByName = new Map(tjAll.map(r => [
        [r.jmeno, r.prijmeni].filter(Boolean).join(" ").trim().toLowerCase(), r
    ]));

    function computeHasTjDiffs(m: {
        id: number; fullName: string; cskNumber: string | null;
        email: string | null; phone: string | null; address: string | null;
        birthDate: string | null; birthNumber: string | null;
        gender: string | null; nickname: string | null;
    }): boolean {
        const tj = m.cskNumber
            ? tjByCsk.get(m.cskNumber)
            : tjByName.get(m.fullName.trim().toLowerCase());
        if (!tj) return false;
        const checks: Array<[SyncUpdatableField, unknown, unknown]> = [
            ["email",       tj.email,       m.email],
            ["phone",       tj.phone,       m.phone],
            ["address",     tj.address,     m.address],
            ["birthDate",   tj.birthDate,   m.birthDate],
            ["birthNumber", tj.birthNumber, m.birthNumber],
            ["gender",      tj.gender,      m.gender],
            ["nickname",    tj.nickname,    m.nickname],
            ["cskNumber",   tj.cskNumber,   m.cskNumber],
            ["fullName",    [tj.jmeno, tj.prijmeni].filter(Boolean).join(" ").trim() || null, m.fullName],
        ];
        return checks.some(([, tjVal, mVal]) => {
            const a = tjVal === null || tjVal === undefined ? null : String(tjVal);
            const b = mVal  === null || mVal  === undefined ? null : String(mVal);
            return a !== b;
        });
    }
    if (isAllYears) {
        const membersResult = await db
            .select({
                id:                 members.id,
                fullName:           members.fullName,
                userLogin:          members.userLogin,
                email:              members.email,
                phone:              members.phone,
                variableSymbol:     members.variableSymbol,
                cskNumber:          members.cskNumber,
                nickname:           members.nickname,
                gender:             members.gender,
                address:            members.address,
                birthDate:          members.birthDate,
                birthNumber:        members.birthNumber,
                note:               members.note,
                todoNote:           members.todoNote,
                memberFrom:         members.memberFrom,
                memberTo:           members.memberTo,
                memberToNote:       members.memberToNote,
            })
            .from(members)
            .orderBy(asc(members.fullName));

        rows = membersResult.map(r => ({
            ...r,
            memberFrom:         r.memberFrom as unknown as string,
            memberTo:           r.memberTo as unknown as string | null,
            memberToNote:       r.memberToNote,
            birthDate:          r.birthDate as unknown as string | null,
            fromDate:           null,
            toDate:             null,
            isCommittee:        false,
            isTom:              false,
            discountIndividual: null,
            isPaid:             null,
            amountTotal:        null,
            hasContrib:         false,
            memberYears:        computeMemberYears(r.memberFrom as unknown as string, r.memberTo as unknown as string | null),
            hasTjDiffs:         computeHasTjDiffs({ ...r, birthDate: r.birthDate as unknown as string | null }),
        }));
    } else {
        // Členové aktivní v daném roce: member_from <= rok-12-31 AND (member_to IS NULL OR member_to >= rok-01-01)
        const result = await db
            .select({
                id:                 members.id,
                fullName:           members.fullName,
                userLogin:          members.userLogin,
                email:              members.email,
                phone:              members.phone,
                variableSymbol:     members.variableSymbol,
                cskNumber:          members.cskNumber,
                nickname:           members.nickname,
                gender:             members.gender,
                address:            members.address,
                birthDate:          members.birthDate,
                birthNumber:        members.birthNumber,
                note:               members.note,
                todoNote:           members.todoNote,
                memberFrom:         members.memberFrom,
                memberTo:           members.memberTo,
                memberToNote:       members.memberToNote,
                discountCommittee:  memberContributions.discountCommittee,
                discountTom:        memberContributions.discountTom,
                discountIndividual: memberContributions.discountIndividual,
                isPaid:             memberContributions.isPaid,
                amountTotal:        memberContributions.amountTotal,
                contribId:          memberContributions.id,
            })
            .from(members)
            .leftJoin(
                memberContributions,
                and(
                    eq(memberContributions.memberId, members.id),
                    period ? eq(memberContributions.periodId, period.id) : eq(memberContributions.id, -1)
                )
            )
            .where(
                and(
                    lte(members.memberFrom, yearEnd(actualYear)),
                    or(isNull(members.memberTo), sql`${members.memberTo} >= ${yearStart(actualYear)}`)
                )
            )
            .orderBy(asc(members.fullName));

        rows = result.map(r => {
            const mFrom = r.memberFrom as unknown as string;
            const mTo   = r.memberTo   as unknown as string | null;
            // Badge se zobrazí jen pokud událost (vstup/odchod) nastala právě v tomto roce
            const fromDate = mFrom && mFrom.startsWith(`${actualYear}`) ? mFrom : null;
            const toDate   = mTo   && mTo.startsWith(`${actualYear}`)   ? mTo   : null;
            return {
                id:                 r.id,
                fullName:           r.fullName,
                userLogin:          r.userLogin,
                email:              r.email,
                phone:              r.phone,
                variableSymbol:     r.variableSymbol,
                cskNumber:          r.cskNumber,
                nickname:           r.nickname,
                gender:             r.gender,
                address:            r.address,
                birthDate:          r.birthDate as unknown as string | null,
                birthNumber:        r.birthNumber,
                note:               r.note,
                todoNote:           r.todoNote,
                memberFrom:         mFrom,
                memberTo:           mTo,
                memberToNote:       r.memberToNote,
                fromDate,
                toDate,
                isCommittee:        Boolean(r.discountCommittee),
                isTom:              Boolean(r.discountTom),
                discountIndividual: r.discountIndividual,
                isPaid:             r.isPaid,
                amountTotal:        r.amountTotal,
                hasContrib:         r.contribId !== null,
                hasTjDiffs:         computeHasTjDiffs({
                    id: r.id, fullName: r.fullName, cskNumber: r.cskNumber,
                    email: r.email, phone: r.phone, address: r.address,
                    birthDate: r.birthDate as unknown as string | null,
                    birthNumber: r.birthNumber, gender: r.gender, nickname: r.nickname,
                }),
            };
        });
    }

    return (
        <MembersClient
            members={rows}
            periods={allPeriods}
            selectedYear={actualYear}
            periodId={period?.id ?? null}
            currentYearDiscounts={currentYearDiscounts}
        />
    );
}
