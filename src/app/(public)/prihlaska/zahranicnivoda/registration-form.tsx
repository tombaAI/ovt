"use client";

import Image from "next/image";
import { useMemo, useState, useTransition } from "react";
import {
    submitForeignWaterRegistration,
    type ForeignWaterFormContext,
    type SubmitForeignWaterRegistrationResult,
} from "@/lib/actions/event-registrations";

type SuccessResult = Extract<SubmitForeignWaterRegistrationResult, { success: true }>;

interface Props {
    context: ForeignWaterFormContext;
}

function fmtDate(iso: string | null): string {
    if (!iso) return "bez termínu";
    const [year, month, day] = iso.split("-");
    return `${Number(day)}. ${Number(month)}. ${year}`;
}

function fmtDateRange(dateFrom: string | null, dateTo: string | null): string {
    if (dateFrom && dateTo && dateFrom !== dateTo) {
        return `${fmtDate(dateFrom)} - ${fmtDate(dateTo)}`;
    }
    if (dateFrom) return fmtDate(dateFrom);
    return "termín bude doplněn";
}

function fmtAmount(amount: number): string {
    return `${new Intl.NumberFormat("cs-CZ").format(amount)} Kč`;
}

export function ForeignWaterRegistrationForm({ context }: Props) {
    const [email, setEmail] = useState("");
    const [firstName, setFirstName] = useState("");
    const [lastName, setLastName] = useState("");
    const [personsCount, setPersonsCount] = useState("1");
    const [personsNames, setPersonsNames] = useState("");
    const [transportInfo, setTransportInfo] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<SuccessResult | null>(null);
    const [copyLabel, setCopyLabel] = useState("Kopírovat zprávu");
    const [isPending, startTransition] = useTransition();

    const eventLabel = useMemo(() => {
        if (!context.event) return null;
        return fmtDateRange(context.event.dateFrom, context.event.dateTo);
    }, [context.event]);

    async function copyMessage(message: string) {
        try {
            await navigator.clipboard.writeText(message);
            setCopyLabel("Zkopírováno");
        } catch {
            setCopyLabel("Kopírování se nepovedlo");
        }
        setTimeout(() => setCopyLabel("Kopírovat zprávu"), 2000);
    }

    function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setError(null);

        startTransition(async () => {
            const result = await submitForeignWaterRegistration({
                email,
                firstName,
                lastName,
                personsCount: Number(personsCount),
                personsNames,
                transportInfo,
            });

            if ("error" in result) {
                setSuccess(null);
                setError(result.error);
                return;
            }

            setSuccess(result);
            setEmail("");
            setFirstName("");
            setLastName("");
            setPersonsCount("1");
            setPersonsNames("");
            setTransportInfo("");
        });
    }

    return (
        <div className="rounded-2xl border border-[#d8e6ce] bg-white shadow-[0_14px_40px_rgba(33,49,14,0.08)] overflow-hidden">
            <div className="px-6 py-7 sm:px-8 sm:py-9 border-b border-[#e7efe1] bg-[linear-gradient(130deg,#f3faec_0%,#ffffff_60%)]">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#4f7a2f]">OVT Bohemians</p>
                <h1 className="mt-2 text-2xl sm:text-3xl font-black text-[#24331a]">Přihláška na zahraniční vodu</h1>
                {context.event ? (
                    <div className="mt-4 text-sm text-[#475840] space-y-1">
                        <p>
                            <span className="font-semibold">Akce:</span> {context.event.name}
                        </p>
                        <p>
                            <span className="font-semibold">Termín:</span> {eventLabel}
                        </p>
                        {context.event.location && (
                            <p>
                                <span className="font-semibold">Místo:</span> {context.event.location}
                            </p>
                        )}
                    </div>
                ) : (
                    <p className="mt-4 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                        Akce zatím není v systému přiřazená k této přihlášce. Přihlášku teď nelze odeslat.
                    </p>
                )}
            </div>

            <div className="px-6 py-7 sm:px-8 sm:py-9 space-y-6">
                <form onSubmit={handleSubmit} className="space-y-5">
                    <div className="grid gap-4 sm:grid-cols-2">
                        <label className="space-y-1.5 block">
                            <span className="text-sm font-medium text-[#2e3f25]">E-mail *</span>
                            <input
                                type="email"
                                required
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className="w-full rounded-lg border border-[#cfddc4] px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#82b965]"
                                placeholder="jmeno@domena.cz"
                            />
                        </label>
                        <label className="space-y-1.5 block">
                            <span className="text-sm font-medium text-[#2e3f25]">Počet osob které přihlašuji</span>
                            <input
                                type="number"
                                min={1}
                                max={50}
                                value={personsCount}
                                onChange={(e) => setPersonsCount(e.target.value)}
                                className="w-full rounded-lg border border-[#cfddc4] px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#82b965]"
                            />
                        </label>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                        <label className="space-y-1.5 block">
                            <span className="text-sm font-medium text-[#2e3f25]">Jméno *</span>
                            <input
                                type="text"
                                required
                                value={firstName}
                                onChange={(e) => setFirstName(e.target.value)}
                                className="w-full rounded-lg border border-[#cfddc4] px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#82b965]"
                                placeholder="Jan"
                            />
                        </label>
                        <label className="space-y-1.5 block">
                            <span className="text-sm font-medium text-[#2e3f25]">Příjmení *</span>
                            <input
                                type="text"
                                required
                                value={lastName}
                                onChange={(e) => setLastName(e.target.value)}
                                className="w-full rounded-lg border border-[#cfddc4] px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#82b965]"
                                placeholder="Novák"
                            />
                        </label>
                    </div>

                    <label className="space-y-1.5 block">
                        <span className="text-sm font-medium text-[#2e3f25]">Jména osob které přihlašuji</span>
                        <textarea
                            rows={3}
                            value={personsNames}
                            onChange={(e) => setPersonsNames(e.target.value)}
                            className="w-full rounded-lg border border-[#cfddc4] px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#82b965] resize-y"
                            placeholder="Např. Jan Novák, Eva Nováková"
                        />
                    </label>

                    <label className="space-y-1.5 block">
                        <span className="text-sm font-medium text-[#2e3f25]">Typy lodí a jiné dopravní prostředky které přihlašuji</span>
                        <textarea
                            rows={3}
                            value={transportInfo}
                            onChange={(e) => setTransportInfo(e.target.value)}
                            className="w-full rounded-lg border border-[#cfddc4] px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#82b965] resize-y"
                            placeholder="Např. creek kajak, auto 3 místa"
                        />
                    </label>

                    {error && (
                        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
                    )}

                    <button
                        type="submit"
                        disabled={!context.event || isPending}
                        className="w-full sm:w-auto rounded-lg bg-[#327600] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#2a6400] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                        {isPending ? "Odesílám..." : "Odeslat přihlášku"}
                    </button>
                </form>

                {success && (
                    <section className="rounded-xl border border-[#cfe2c2] bg-[#f4faef] p-5 space-y-3">
                        <h2 className="text-lg font-bold text-[#244217]">Přihláška byla odeslána</h2>
                        {success.emailSent ? (
                            <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-md px-3 py-2">
                                Potvrzení s platebními údaji a QR kódem bylo odesláno na {success.confirmationEmail}.
                            </p>
                        ) : (
                            <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
                                {success.emailError ?? "Přihláška je uložená, ale potvrzovací e-mail se nepodařilo odeslat."}
                            </p>
                        )}
                        <p className="text-sm text-[#3b5630]">
                            Evidenční číslo předpisu: <span className="font-semibold">C{success.payment.codeLabel}</span>
                        </p>
                        <div className="grid gap-2 text-sm text-[#2f4326]">
                            <p>
                                <span className="font-semibold">Číslo účtu:</span> {success.payment.bankAccount}
                            </p>
                            <p>
                                <span className="font-semibold">VS:</span> {success.payment.variableSymbol}
                            </p>
                            <p>
                                <span className="font-semibold">Částka:</span> {fmtAmount(success.payment.amount)}
                            </p>
                            <p className="break-words">
                                <span className="font-semibold">Zpráva pro příjemce:</span> {success.payment.messageForRecipient}
                            </p>
                        </div>
                        <div className="rounded-lg border border-[#d4e8c8] bg-white p-3 inline-flex flex-col items-center gap-2">
                            <p className="text-xs text-[#3b5630] font-medium">QR kód k platbě</p>
                            <Image
                                src={success.payment.qrCodeDataUrl}
                                alt="QR kód platby"
                                width={220}
                                height={220}
                                unoptimized
                                className="rounded border border-[#e6efdf]"
                            />
                        </div>
                        <button
                            type="button"
                            className="rounded-md border border-[#9dc47f] bg-white px-3 py-1.5 text-xs font-medium text-[#2f4f1e] hover:bg-[#f0f7e8]"
                            onClick={() => copyMessage(success.payment.messageForRecipient)}
                        >
                            {copyLabel}
                        </button>
                    </section>
                )}

                <section className="rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700">
                    <p className="font-semibold mb-1">Platební údaje</p>
                    <p>Číslo účtu: {context.payment.bankAccount}</p>
                    <p>VS: {context.payment.variableSymbol}</p>
                    <p>Částka: {fmtAmount(context.payment.amount)}</p>
                </section>
            </div>
        </div>
    );
}
