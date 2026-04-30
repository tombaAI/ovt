import { notFound } from "next/navigation";
import { getDb } from "@/lib/db";
import { members, memberContributions, contributionPeriods, importMembersTjBohemians } from "@/db/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { getBrigadeMemberIdsByYear } from "@/lib/actions/brigades";
import { getSelectedYear } from "@/lib/actions/year";
import { MemberDetailClient } from "./member-detail-client";
import type { SyncUpdatableField } from "@/lib/sync-config";
import type { MemberWithFlags } from "../page";

export default async function MemberDetailPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { id } = await params;
    const memberId = Number(id);
    if (isNaN(memberId) || memberId <= 0) notFound();

    const db = getDb();
    const selectedYear = await getSelectedYear();

    const allPeriods = await db
        .select({ id: contributionPeriods.id, year: contributionPeriods.year })
        .from(contributionPeriods)
        .orderBy(desc(contributionPeriods.year));

    const period = allPeriods.find(p => p.year === selectedYear) ?? null;


    const actualYear = period?.year ?? selectedYear;

    const brigadeMembers = await getBrigadeMemberIdsByYear(
        actualYear > 0 ? actualYear - 1 : actualYear
    );

    const tjAll = await db.select().from(importMembersTjBohemians);
    const tjByCsk  = new Map(tjAll.filter(r => r.cskNumber).map(r => [r.cskNumber!, r]));
    const tjByName = new Map(tjAll.map(r => [
        [r.jmeno, r.prijmeni].filter(Boolean).join(" ").trim().toLowerCase(), r,
    ]));

    function computeHasTjDiffs(m: {
        firstName: string; lastName: string; cskNumber: string | null;
        email: string | null; phone: string | null; address: string | null;
        birthDate: string | null; birthNumber: string | null;
        gender: string | null; nickname: string | null;
    }): boolean {
        const nameLower = `${m.firstName} ${m.lastName}`.trim().toLowerCase();
        const tj = m.cskNumber ? tjByCsk.get(m.cskNumber) : tjByName.get(nameLower);
        if (!tj) return false;
        const checks: Array<[SyncUpdatableField, unknown, unknown]> = [
            ["firstName",   tj.jmeno,       m.firstName],
            ["lastName",    tj.prijmeni,    m.lastName],
            ["email",       tj.email,       m.email],
            ["phone",       tj.phone,       m.phone],
            ["address",     tj.address,     m.address],
            ["birthDate",   tj.birthDate,   m.birthDate],
            ["birthNumber", tj.birthNumber, m.birthNumber],
            ["gender",      tj.gender,      m.gender],
            ["nickname",    tj.nickname,    m.nickname],
            ["cskNumber",   tj.cskNumber,   m.cskNumber],
        ];
        return checks.some(([, tjVal, mVal]) => {
            const a = tjVal === null || tjVal === undefined ? null : String(tjVal);
            const b = mVal  === null || mVal  === undefined ? null : String(mVal);
            return a !== b;
        });
    }

    const result = await db
        .select({
            id:                 members.id,
            firstName:          members.firstName,
            lastName:           members.lastName,
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
            bankAccountNumber:  members.bankAccountNumber,
            bankCode:           members.bankCode,
            note:               members.note,
            todoNote:           members.todoNote,
            membershipReviewed: members.membershipReviewed,
            memberFrom:         members.memberFrom,
            memberTo:           members.memberTo,
            memberToNote:       members.memberToNote,
            isCommitteeMember:  members.isCommitteeMember,
            isTomLeader:        members.isTomLeader,
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
                period ? eq(memberContributions.periodId, period.id) : sql`false`
            )
        )
        .where(eq(members.id, memberId));

    if (result.length === 0) notFound();
    const r = result[0]!;

    const mFrom = r.memberFrom as unknown as string;
    const mTo   = r.memberTo   as unknown as string | null;
    const fromDate = mFrom && mFrom.startsWith(`${actualYear}`) ? mFrom : null;
    const toDate   = mTo   && mTo.startsWith(`${actualYear}`)   ? mTo   : null;

    const member: MemberWithFlags = {
        id:                 r.id,
        firstName:          r.firstName,
        lastName:           r.lastName,
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
        bankAccountNumber:  r.bankAccountNumber,
        bankCode:           r.bankCode,
        note:               r.note,
        todoNote:           r.todoNote,
        membershipReviewed: r.membershipReviewed,
        memberFrom:         mFrom,
        memberTo:           mTo,
        memberToNote:       r.memberToNote,
        fromDate,
        toDate,
        isCommittee:        r.isCommitteeMember,
        isTom:              r.isTomLeader,
        discountIndividual: r.discountIndividual,
        isPaid:             r.isPaid,
        amountTotal:        r.amountTotal,
        hasContrib:         r.contribId !== null,
        hasBrigade:         brigadeMembers.has(r.id),
        hasTjDiffs:         computeHasTjDiffs({
            firstName: r.firstName, lastName: r.lastName, cskNumber: r.cskNumber,
            email: r.email, phone: r.phone, address: r.address,
            birthDate: r.birthDate as unknown as string | null,
            birthNumber: r.birthNumber, gender: r.gender, nickname: r.nickname,
        }),
    };

    return (
        <MemberDetailClient
            member={member}
            selectedYear={actualYear}
            periodId={period?.id ?? null}
        />
    );
}
