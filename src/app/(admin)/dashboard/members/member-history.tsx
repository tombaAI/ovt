"use client";

import { useEffect, useState } from "react";
import {
    getMemberHistory, getMemberEventRegistrations,
    type MemberYearRecord, type MemberEventReg,
} from "@/lib/actions/members";

// ── Helpers ───────────────────────────────────────────────────────────────────

export function fmtDateShort(iso: string | null): string {
    if (!iso) return "—";
    const [y, m, d] = iso.split("-");
    return `${Number(d)}. ${Number(m)}. ${y}`;
}

function fmtSource(s: string) {
    if (s === "fio_bank") return "FIO";
    if (s === "file_import") return "import";
    if (s === "cash") return "hotovost";
    if (s === "tj_finance") return "TJ";
    return s;
}

const EVENT_TYPE_LABELS: Record<string, string> = {
    cpv: "CPV",
    foreign: "Zahraniční",
    recreational: "Rekreační",
    club: "Oddílová",
    race: "Závod",
    brigada: "Brigáda",
    other: "Jiná",
};

function prescStatusBadge(status: string | null) {
    if (!status) return null;
    if (status === "paid") return <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-green-50 text-green-700 border border-green-200">zaplaceno</span>;
    if (status === "matched") return <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-50 text-blue-700 border border-blue-200">spárováno</span>;
    if (status === "pending") return <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-50 text-amber-700 border border-amber-200">čeká</span>;
    if (status === "cancelled") return <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-100 text-gray-500">storno</span>;
    return null;
}

// ── ContributionHistory — účetní přehled "má dáti / dal" ─────────────────────

function buildPrescriptionDesc(r: MemberYearRecord): string {
    const parts: string[] = [];
    if (r.amountBase)          parts.push(`základ ${r.amountBase.toLocaleString("cs-CZ")} Kč`);
    if (r.amountBoat1)         parts.push(`loď ${r.amountBoat1.toLocaleString("cs-CZ")} Kč`);
    if (r.amountBoat2)         parts.push(`2. loď ${r.amountBoat2.toLocaleString("cs-CZ")} Kč`);
    if (r.amountBoat3)         parts.push(`3. loď ${r.amountBoat3.toLocaleString("cs-CZ")} Kč`);
    if (r.brigadeSurcharge && r.brigadeSurcharge > 0)
                               parts.push(`brigáda +${r.brigadeSurcharge.toLocaleString("cs-CZ")} Kč`);
    if (r.discountCommittee)   parts.push(`výbor −${Math.abs(r.discountCommittee).toLocaleString("cs-CZ")} Kč`);
    if (r.discountTom)         parts.push(`TOM −${Math.abs(r.discountTom).toLocaleString("cs-CZ")} Kč`);
    if (r.discountIndividual)  parts.push(`ind. sleva −${Math.abs(r.discountIndividual).toLocaleString("cs-CZ")} Kč`);
    return parts.join(", ");
}

export function ContributionHistory({ memberId }: { memberId: number }) {
    const [rows, setRows] = useState<MemberYearRecord[] | null>(null);

    useEffect(() => {
        getMemberHistory(memberId).then(setRows);
    }, [memberId]);

    if (!rows) return <p className="text-xs text-gray-400 py-2">Načítám…</p>;
    if (rows.length === 0) return <p className="text-xs text-gray-400 py-2">Žádné záznamy</p>;

    return (
        <div className="space-y-4">
            {rows.map(r => {
                const balance = r.hasContrib && r.amountTotal !== null
                    ? r.paidTotal - r.amountTotal
                    : null;
                const isOverpaid  = balance !== null && balance > 0;
                const isUnderpaid = balance !== null && balance < 0;
                const isBalanced  = balance === 0;

                return (
                    <div key={r.year} className="rounded-xl border overflow-hidden">
                        {/* Hlavička roku */}
                        <div className="flex items-center justify-between px-4 py-2 bg-gray-50 border-b">
                            <span className="text-sm font-semibold text-gray-800">{r.year}</span>
                            {balance === null && !r.hasContrib && (
                                <span className="text-xs text-amber-600 font-medium">⚠ chybí předpis</span>
                            )}
                            {isBalanced  && <span className="text-xs font-semibold text-[#327600]">✓ Vyrovnáno</span>}
                            {isOverpaid  && <span className="text-xs font-semibold text-orange-600">Přeplatek {balance!.toLocaleString("cs-CZ")} Kč</span>}
                            {isUnderpaid && <span className="text-xs font-semibold text-red-600">Nedoplatek {Math.abs(balance!).toLocaleString("cs-CZ")} Kč</span>}
                        </div>

                        {/* Tabulka má dáti / dal */}
                        <table className="w-full text-xs">
                            <thead>
                                <tr className="border-b text-[10px] font-semibold text-gray-400 uppercase tracking-wide">
                                    <th className="text-left px-4 py-1.5 w-24">Datum</th>
                                    <th className="text-left px-2 py-1.5">Popis</th>
                                    <th className="text-right px-4 py-1.5 w-28 text-red-400">Má dáti</th>
                                    <th className="text-right px-4 py-1.5 w-28 text-green-600">Dal</th>
                                </tr>
                            </thead>
                            <tbody>
                                {/* Předpis — Má dáti */}
                                {r.hasContrib && r.amountTotal !== null && (
                                    <tr className="border-b bg-red-50/30">
                                        <td className="px-4 py-2 text-gray-500 whitespace-nowrap">
                                            {r.dueDate ? fmtDateShort(r.dueDate) : `${r.year}`}
                                        </td>
                                        <td className="px-2 py-2 text-gray-700">
                                            Předpis příspěvků
                                            {buildPrescriptionDesc(r) && (
                                                <span className="ml-1 text-gray-400">({buildPrescriptionDesc(r)})</span>
                                            )}
                                        </td>
                                        <td className="px-4 py-2 text-right font-mono font-semibold text-red-700 whitespace-nowrap">
                                            {r.amountTotal.toLocaleString("cs-CZ")} Kč
                                        </td>
                                        <td className="px-4 py-2" />
                                    </tr>
                                )}

                                {/* Confirmed platby — Dal */}
                                {r.payments.map(p => (
                                    <tr key={p.id} className="border-b bg-green-50/20">
                                        <td className="px-4 py-2 text-gray-500 whitespace-nowrap">
                                            {p.paidAt ? fmtDateShort(p.paidAt) : "—"}
                                        </td>
                                        <td className="px-2 py-2 text-gray-700 flex items-center gap-1.5 flex-wrap">
                                            <span className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 text-[10px] font-medium">
                                                {fmtSource(p.sourceType)}
                                            </span>
                                            {p.note && <span className="text-gray-400 italic">{p.note}</span>}
                                        </td>
                                        <td className="px-4 py-2" />
                                        <td className="px-4 py-2 text-right font-mono font-semibold text-green-700 whitespace-nowrap">
                                            {p.amount.toLocaleString("cs-CZ")} Kč
                                        </td>
                                    </tr>
                                ))}

                                {/* Suggested / pending platby */}
                                {r.pendingPayments.map(p => (
                                    <tr key={p.id} className="border-b opacity-60">
                                        <td className="px-4 py-2 text-gray-400 whitespace-nowrap">
                                            {p.paidAt ? fmtDateShort(p.paidAt) : "—"}
                                        </td>
                                        <td className="px-2 py-2 text-gray-400 flex items-center gap-1.5 flex-wrap">
                                            <span className="px-1.5 py-0.5 rounded bg-amber-50 text-amber-600 text-[10px] font-medium border border-amber-200">
                                                čeká na potvrzení
                                            </span>
                                            <span className="text-[10px]">{fmtSource(p.sourceType)}</span>
                                            {p.note && <span className="italic">{p.note}</span>}
                                        </td>
                                        <td className="px-4 py-2" />
                                        <td className="px-4 py-2 text-right font-mono text-gray-400 whitespace-nowrap">
                                            ({p.amount.toLocaleString("cs-CZ")} Kč)
                                        </td>
                                    </tr>
                                ))}

                                {/* Žádné záznamy */}
                                {!r.hasContrib && r.payments.length === 0 && r.pendingPayments.length === 0 && (
                                    <tr>
                                        <td colSpan={4} className="px-4 py-3 text-gray-400 text-center">
                                            Žádné záznamy
                                        </td>
                                    </tr>
                                )}

                                {/* Součet */}
                                {r.hasContrib && (
                                    <tr className="bg-gray-50 font-semibold text-xs">
                                        <td className="px-4 py-2" />
                                        <td className="px-2 py-2 text-gray-500">Celkem</td>
                                        <td className="px-4 py-2 text-right font-mono text-gray-700">
                                            {(r.amountTotal ?? 0).toLocaleString("cs-CZ")} Kč
                                        </td>
                                        <td className="px-4 py-2 text-right font-mono text-gray-700">
                                            {r.paidTotal.toLocaleString("cs-CZ")} Kč
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                );
            })}
        </div>
    );
}

// ── EventHistory ──────────────────────────────────────────────────────────────

export function EventHistory({ memberId }: { memberId: number }) {
    const [rows, setRows] = useState<MemberEventReg[] | null>(null);

    useEffect(() => {
        getMemberEventRegistrations(memberId).then(setRows);
    }, [memberId]);

    if (!rows) return <p className="text-xs text-gray-400 py-2">Načítám…</p>;
    if (rows.length === 0) return <p className="text-xs text-gray-400 py-2">Žádné přihlášky</p>;

    return (
        <div className="space-y-1">
            {rows.map(r => {
                const cancelled = Boolean(r.cancelledAt);
                return (
                    <div
                        key={r.registrationId}
                        className={["rounded-lg border px-3 py-2", cancelled ? "opacity-50" : ""].join(" ")}
                    >
                        <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                                <p className={["text-sm font-medium truncate", cancelled ? "line-through text-gray-400" : ""].join(" ")}>
                                    {r.eventName}
                                </p>
                                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5 text-xs text-gray-500">
                                    <span>{r.year}</span>
                                    {r.dateFrom && (
                                        <span>
                                            {fmtDateShort(r.dateFrom)}
                                            {r.dateTo && r.dateTo !== r.dateFrom ? ` – ${fmtDateShort(r.dateTo)}` : ""}
                                        </span>
                                    )}
                                    <span className="px-1 rounded bg-gray-100 text-gray-500">
                                        {EVENT_TYPE_LABELS[r.eventType] ?? r.eventType}
                                    </span>
                                    {r.personsCount > 1 && <span>{r.personsCount} os.</span>}
                                    {cancelled && <span className="text-red-500">storno</span>}
                                </div>
                            </div>
                            <div className="shrink-0 text-right space-y-0.5">
                                {r.prescriptionAmount !== null && (
                                    <p className="text-xs font-mono font-semibold text-gray-700">
                                        {r.prescriptionAmount.toLocaleString("cs-CZ")} Kč
                                    </p>
                                )}
                                {prescStatusBadge(r.prescriptionStatus)}
                            </div>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
