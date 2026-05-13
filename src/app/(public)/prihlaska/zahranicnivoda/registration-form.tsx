"use client";

import Image from "next/image";
import { useMemo, useState, useTransition } from "react";
import {
    submitForeignWaterRegistration,
    type ForeignWaterFormContext,
    type SubmitForeignWaterRegistrationResult,
} from "@/lib/actions/event-registrations";

type SuccessResult = Extract<SubmitForeignWaterRegistrationResult, { success: true }>;

type PersonRow = { name: string; isMember: boolean };

export type ForeignWaterRegistrationFormPrefill = {
    registrationId: number;
    registrationToken: string;
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    primaryIsMember: boolean;
    additionalPersons: PersonRow[];
    transportInfo: string;
};

interface Props {
    context: ForeignWaterFormContext;
    prefill?: ForeignWaterRegistrationFormPrefill | null;
}

const MAX_PERSONS = 50;

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

function normalizeText(value: string): string {
    return value.replace(/\s+/g, " ").trim();
}

function withSingleTrailingRow(values: PersonRow[]): PersonRow[] {
    const next = [...values];

    while (next.length > 1 && !next[next.length - 1].name.trim() && !next[next.length - 2].name.trim()) {
        next.pop();
    }

    if (next.length < MAX_PERSONS - 1 && next.every((item) => item.name.trim().length > 0)) {
        next.push({ name: "", isMember: false });
    }

    return next;
}

function MemberToggle({
    value,
    onChange,
}: {
    value: boolean;
    onChange: (v: boolean) => void;
}) {
    return (
        <div className="flex rounded-lg border border-[#cfddc4] overflow-hidden text-xs shrink-0">
            <button
                type="button"
                onClick={() => onChange(true)}
                className={`px-3 py-2 transition-colors ${
                    value
                        ? "bg-[#327600] text-white font-semibold"
                        : "bg-white text-[#4b5b43] hover:bg-[#f5faf1]"
                }`}
            >
                Člen
            </button>
            <button
                type="button"
                onClick={() => onChange(false)}
                className={`px-3 py-2 border-l border-[#cfddc4] transition-colors ${
                    !value
                        ? "bg-[#4b5b43] text-white font-semibold"
                        : "bg-white text-[#4b5b43] hover:bg-[#f5faf1]"
                }`}
            >
                Nečlen
            </button>
        </div>
    );
}

export function ForeignWaterRegistrationForm({ context, prefill }: Props) {
    const [email, setEmail] = useState(prefill?.email ?? "");
    const [phone, setPhone] = useState(prefill?.phone ?? "");
    const [firstName, setFirstName] = useState(prefill?.firstName ?? "");
    const [lastName, setLastName] = useState(prefill?.lastName ?? "");
    const [primaryIsMember, setPrimaryIsMember] = useState(prefill?.primaryIsMember ?? false);
    const [additionalPersonsRows, setAdditionalPersonsRows] = useState<PersonRow[]>(() =>
        withSingleTrailingRow(prefill?.additionalPersons ?? []),
    );
    const [transportInfo, setTransportInfo] = useState(prefill?.transportInfo ?? "");
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<SuccessResult | null>(null);
    const [isEditMode, setIsEditMode] = useState(true);
    const [copyLabel, setCopyLabel] = useState("Kopírovat zprávu");
    const [isPending, startTransition] = useTransition();

    const eventLabel = useMemo(() => {
        if (!context.event) return null;
        return fmtDateRange(context.event.dateFrom, context.event.dateTo);
    }, [context.event]);

    const additionalPersons = useMemo(
        () =>
            additionalPersonsRows
                .filter((row) => normalizeText(row.name))
                .map((row) => ({ name: normalizeText(row.name), isMember: row.isMember })),
        [additionalPersonsRows],
    );

    const mainPerson = useMemo(
        () => normalizeText(`${firstName} ${lastName}`),
        [firstName, lastName],
    );

    const participantNames = useMemo(() => {
        if (!mainPerson) return additionalPersons.map((p) => p.name);
        return [mainPerson, ...additionalPersons.map((p) => p.name)];
    }, [mainPerson, additionalPersons]);

    async function copyMessage(message: string) {
        try {
            await navigator.clipboard.writeText(message);
            setCopyLabel("Zkopírováno");
        } catch {
            setCopyLabel("Kopírování se nepovedlo");
        }
        setTimeout(() => setCopyLabel("Kopírovat zprávu"), 2000);
    }

    function onAdditionalPersonChange(index: number, field: "name" | "isMember", value: string | boolean) {
        setAdditionalPersonsRows((current) => {
            const next = current.map((row, i) =>
                i === index ? { ...row, [field]: value } : row,
            );
            return field === "name" ? withSingleTrailingRow(next) : next;
        });
    }

    function enterEditMode() {
        setError(null);
        setIsEditMode(true);
    }

    function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setError(null);

        startTransition(async () => {
            const result = await submitForeignWaterRegistration({
                registrationId: success?.registrationId ?? prefill?.registrationId,
                email,
                phone,
                firstName,
                lastName,
                primaryIsMember,
                additionalPersons,
                transportInfo,
            });

            if ("error" in result) {
                setError(result.error);
                return;
            }

            setSuccess(result);
            setIsEditMode(false);
            setAdditionalPersonsRows(
                withSingleTrailingRow(additionalPersons),
            );
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
                {isEditMode ? (
                    <form onSubmit={handleSubmit} className="space-y-5">
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
                                <span className="text-sm font-medium text-[#2e3f25]">Telefon *</span>
                                <input
                                    type="tel"
                                    required
                                    value={phone}
                                    onChange={(e) => setPhone(e.target.value)}
                                    className="w-full rounded-lg border border-[#cfddc4] px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#82b965]"
                                    placeholder="Např. +420 777 123 456"
                                />
                            </label>
                        </div>

                        <div className="space-y-2.5">
                            <div className="flex items-center justify-between gap-3">
                                <p className="text-sm font-medium text-[#2e3f25]">Osoby na akci</p>
                                <p className="text-xs text-[#4b5b43]">Počet osob: {participantNames.length}</p>
                            </div>

                            {/* Řádek 1 — hlavní přihlašující */}
                            <div className="flex items-center gap-2">
                                <div className="flex-1 rounded-lg border border-[#dbe9d0] bg-[#f8fcf5] px-3 py-2.5 text-sm text-[#314328]">
                                    {mainPerson || "(nejdřív vyplň jméno a příjmení)"}
                                </div>
                                <MemberToggle value={primaryIsMember} onChange={setPrimaryIsMember} />
                            </div>

                            {/* Řádky 2+ — další osoby */}
                            {additionalPersonsRows.map((row, index) => (
                                <div key={index} className="flex items-center gap-2">
                                    <input
                                        type="text"
                                        value={row.name}
                                        onChange={(e) => onAdditionalPersonChange(index, "name", e.target.value)}
                                        className="flex-1 rounded-lg border border-[#cfddc4] px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#82b965]"
                                        placeholder={`Další osoba ${index + 2}`}
                                    />
                                    <MemberToggle
                                        value={row.isMember}
                                        onChange={(v) => onAdditionalPersonChange(index, "isMember", v)}
                                    />
                                </div>
                            ))}

                            <p className="text-xs text-[#63735a]">
                                Nový řádek se přidá automaticky po vyplnění posledního jména.
                            </p>
                        </div>

                        <label className="space-y-1.5 block">
                            <span className="text-sm font-medium text-[#2e3f25]">Typy lodí a jiné dopravní prostředky které přihlašuji *</span>
                            <textarea
                                required
                                rows={3}
                                value={transportInfo}
                                onChange={(e) => setTransportInfo(e.target.value)}
                                className="w-full rounded-lg border border-[#cfddc4] px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#82b965] resize-y"
                                placeholder="Např. C1, K1, C2 Vaňha, nafukovačka, kolo"
                            />
                        </label>

                        <div className="rounded-xl border border-[#d7e8ca] bg-[#f7fcf3] px-4 py-3 space-y-1.5">
                            <p className="text-sm font-semibold text-[#2e4a1f]">Po kliknutí na Přihlásit</p>
                            <p className="text-sm text-[#4a6040]">
                                uložíme přihlášku do systému a hned níže zobrazíme platební údaje k úhradě zálohy.
                            </p>
                        </div>

                        {error && (
                            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
                        )}

                        <button
                            type="submit"
                            disabled={!context.event || isPending || participantNames.length < 1 || participantNames.length > MAX_PERSONS}
                            className="w-full sm:w-auto rounded-lg bg-[#327600] px-6 py-2.5 text-sm font-semibold text-white hover:bg-[#2a6400] disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            {isPending ? "Ukládám..." : (success || prefill ? "Uložit změny" : "Přihlásit")}
                        </button>
                    </form>
                ) : (
                    <section className="rounded-xl border border-[#d1e4c3] bg-[#f6fbf2] p-5 space-y-4">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <h2 className="text-lg font-bold text-[#244217]">Přihláška je uložená</h2>
                            <button
                                type="button"
                                onClick={enterEditMode}
                                className="inline-flex items-center justify-center rounded-md border border-[#98bf7c] bg-white px-4 py-2 text-sm font-medium text-[#2f4f1e] hover:bg-[#f0f7e8]"
                            >
                                Upravit
                            </button>
                        </div>

                        <div className="grid gap-2 text-sm text-[#2f4326] sm:grid-cols-2">
                            <p><span className="font-semibold">Jméno:</span> {firstName}</p>
                            <p><span className="font-semibold">Příjmení:</span> {lastName}</p>
                            <p><span className="font-semibold">E-mail:</span> {email}</p>
                            <p><span className="font-semibold">Telefon:</span> {phone || "neuveden"}</p>
                            <p><span className="font-semibold">Počet osob:</span> {success?.payment.personsCount ?? participantNames.length}</p>
                            {transportInfo && (
                                <p className="sm:col-span-2 break-words"><span className="font-semibold">Lodě / doprava:</span> {transportInfo}</p>
                            )}
                            <div className="sm:col-span-2">
                                <p className="font-semibold">Seznam osob:</p>
                                <ul className="mt-1 space-y-0.5 text-[#3f5534]">
                                    <li key="primary" className="flex items-center gap-1.5">
                                        {mainPerson}
                                        {primaryIsMember
                                            ? <span className="text-[10px] font-medium text-[#327600] border border-[#c2dda9] bg-[#f0f9e8] rounded px-1.5 py-0.5">člen</span>
                                            : <span className="text-[10px] font-medium text-[#6b7280] border border-gray-200 bg-gray-50 rounded px-1.5 py-0.5">nečlen</span>
                                        }
                                    </li>
                                    {additionalPersons.map((person, idx) => (
                                        <li key={idx} className="flex items-center gap-1.5">
                                            {person.name}
                                            {person.isMember
                                                ? <span className="text-[10px] font-medium text-[#327600] border border-[#c2dda9] bg-[#f0f9e8] rounded px-1.5 py-0.5">člen</span>
                                                : <span className="text-[10px] font-medium text-[#6b7280] border border-gray-200 bg-gray-50 rounded px-1.5 py-0.5">nečlen</span>
                                            }
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        </div>
                    </section>
                )}

                {success && (
                    <section className="rounded-xl border bg-white p-5 shadow-sm space-y-4">
                        <div className="flex items-center justify-between gap-3">
                            <h2 className="text-sm font-semibold text-gray-700">Platební údaje k záloze</h2>
                            {success.emailSent ? (
                                <span className="rounded-md border border-green-200 bg-green-50 px-2.5 py-1 text-xs font-medium text-green-700">
                                    Potvrzení odesláno na {success.confirmationEmail}
                                </span>
                            ) : (
                                <span className="rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700">
                                    {success.emailError ?? "Přihláška je uložená, ale potvrzovací e-mail se nepodařilo odeslat."}
                                </span>
                            )}
                        </div>

                        <div className="flex flex-col items-start gap-4 sm:flex-row">
                            <Image
                                src={success.payment.qrCodeUrl}
                                alt="QR kód platby"
                                width={200}
                                height={200}
                                unoptimized
                                className="shrink-0 rounded-lg border border-gray-200 bg-white p-1.5"
                            />

                            <div className="grid gap-3 text-sm sm:grid-cols-2">
                                <div>
                                    <p className="text-xs text-gray-400">Číslo účtu</p>
                                    <p className="font-mono font-semibold text-gray-800">{success.payment.bankAccount}</p>
                                </div>
                                <div>
                                    <p className="text-xs text-gray-400">Variabilní symbol</p>
                                    <p className="font-mono font-semibold text-gray-800">{success.payment.variableSymbol}</p>
                                </div>
                                <div>
                                    <p className="text-xs text-gray-400">Počet osob</p>
                                    <p className="font-semibold text-gray-800">{success.payment.personsCount}</p>
                                </div>
                                <div>
                                    <p className="text-xs text-gray-400">Cena za osobu</p>
                                    <p className="font-semibold text-gray-800">{fmtAmount(success.payment.amountPerPerson)}</p>
                                </div>
                                <div className="sm:col-span-2">
                                    <p className="text-xs text-gray-400">Částka k úhradě</p>
                                    <p className="text-lg font-semibold text-[#327600]">{fmtAmount(success.payment.amount)}</p>
                                </div>
                                <div className="sm:col-span-2">
                                    <p className="text-xs text-gray-400">Zpráva pro příjemce</p>
                                    <p className="break-words text-sm text-gray-700">{success.payment.messageForRecipient}</p>
                                </div>
                            </div>
                        </div>

                        <button
                            type="button"
                            className="rounded-md border border-[#9dc47f] bg-white px-3 py-1.5 text-xs font-medium text-[#2f4f1e] hover:bg-[#f0f7e8]"
                            onClick={() => copyMessage(success.payment.messageForRecipient)}
                        >
                            {copyLabel}
                        </button>

                        <div className="rounded-md border border-[#dbe7d2] bg-[#f7fcf3] px-3 py-2 text-xs text-[#466133]">
                            <p className="font-medium">Trvalý odkaz na detail přihlášky (jen pro čtení):</p>
                            <a
                                href={success.registrationDetailUrl}
                                className="mt-1 block break-all text-[#2f6212] underline underline-offset-2"
                            >
                                {success.registrationDetailUrl}
                            </a>
                        </div>
                    </section>
                )}
            </div>
        </div>
    );
}
