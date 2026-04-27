import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getForeignWaterRegistrationByToken } from "@/lib/actions/event-registrations";

export const metadata = {
    title: "Detail přihlášky - Zahraniční voda",
    description: "Detail uložené přihlášky na zahraniční vodu OVT Bohemians.",
};

export const dynamic = "force-dynamic";

function fmtAmount(amount: number): string {
    return `${new Intl.NumberFormat("cs-CZ").format(amount)} Kč`;
}

function fmtDate(iso: string | null): string {
    if (!iso) return "termín bude doplněn";
    const [year, month, day] = iso.split("-");
    return `${Number(day)}. ${Number(month)}. ${year}`;
}

function fmtDateRange(dateFrom: string | null, dateTo: string | null): string {
    if (dateFrom && dateTo && dateFrom !== dateTo) {
        return `${fmtDate(dateFrom)} - ${fmtDate(dateTo)}`;
    }
    return fmtDate(dateFrom);
}

export default async function ForeignWaterRegistrationDetailPage({
    params,
}: {
    params: Promise<{ token: string }>;
}) {
    const { token } = await params;
    const detail = await getForeignWaterRegistrationByToken(token);
    if (!detail) notFound();

    return (
        <main className="min-h-screen bg-[radial-gradient(circle_at_top,_#eef8e6,_#f5f7f2_45%,_#ffffff)] px-4 py-10 sm:py-14">
            <div className="mx-auto w-full max-w-3xl space-y-5">
                <div className="rounded-2xl border border-[#d8e6ce] bg-white shadow-[0_14px_40px_rgba(33,49,14,0.08)] overflow-hidden">
                    <div className="px-6 py-7 sm:px-8 sm:py-9 border-b border-[#e7efe1] bg-[linear-gradient(130deg,#f3faec_0%,#ffffff_60%)]">
                        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#4f7a2f]">OVT Bohemians</p>
                        <h1 className="mt-2 text-2xl sm:text-3xl font-black text-[#24331a]">Detail přihlášky na zahraniční vodu</h1>
                        <div className="mt-4 text-sm text-[#475840] space-y-1">
                            <p>
                                <span className="font-semibold">Akce:</span> {detail.event.name}
                            </p>
                            <p>
                                <span className="font-semibold">Termín:</span> {fmtDateRange(detail.event.dateFrom, detail.event.dateTo)}
                            </p>
                            {detail.event.location && (
                                <p>
                                    <span className="font-semibold">Místo:</span> {detail.event.location}
                                </p>
                            )}
                        </div>
                    </div>

                    <div className="px-6 py-7 sm:px-8 sm:py-9 space-y-6">
                        <section className="rounded-xl border border-[#d1e4c3] bg-[#f6fbf2] p-5 space-y-4">
                            <h2 className="text-lg font-bold text-[#244217]">Uložené údaje</h2>
                            <div className="grid gap-2 text-sm text-[#2f4326] sm:grid-cols-2">
                                <p><span className="font-semibold">Jméno:</span> {detail.registrant.firstName}</p>
                                <p><span className="font-semibold">Příjmení:</span> {detail.registrant.lastName}</p>
                                <p><span className="font-semibold">E-mail:</span> {detail.registrant.email}</p>
                                <p><span className="font-semibold">Telefon:</span> {detail.registrant.phone || "neuveden"}</p>
                                <p><span className="font-semibold">Počet osob:</span> {detail.payment.personsCount}</p>
                                {detail.transportInfo && (
                                    <p className="sm:col-span-2 break-words"><span className="font-semibold">Lodě / doprava:</span> {detail.transportInfo}</p>
                                )}
                                <div className="sm:col-span-2">
                                    <p className="font-semibold">Seznam účastníků:</p>
                                    <ul className="mt-1 space-y-0.5 text-[#3f5534]">
                                        {detail.participants.map((participant) => (
                                            <li key={`${participant.participantOrder}-${participant.fullName}`}>
                                                {participant.fullName}
                                                {participant.isPrimary ? " (hlavní přihlašující)" : ""}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            </div>
                        </section>

                        <section className="rounded-xl border bg-white p-5 shadow-sm space-y-4">
                            <h2 className="text-sm font-semibold text-gray-700">Platební údaje k záloze</h2>

                            <div className="flex flex-col items-start gap-4 sm:flex-row">
                                <Image
                                    src={detail.payment.qrCodeUrl}
                                    alt="QR kód platby"
                                    width={200}
                                    height={200}
                                    unoptimized
                                    className="shrink-0 rounded-lg border border-gray-200 bg-white p-1.5"
                                />

                                <div className="grid gap-3 text-sm sm:grid-cols-2">
                                    <div>
                                        <p className="text-xs text-gray-400">Číslo předpisu</p>
                                        <p className="font-mono font-semibold text-gray-800">C{detail.payment.codeLabel}</p>
                                    </div>
                                    <div>
                                        <p className="text-xs text-gray-400">Číslo účtu</p>
                                        <p className="font-mono font-semibold text-gray-800">{detail.payment.bankAccount}</p>
                                    </div>
                                    <div>
                                        <p className="text-xs text-gray-400">Variabilní symbol</p>
                                        <p className="font-mono font-semibold text-gray-800">{detail.payment.variableSymbol}</p>
                                    </div>
                                    <div>
                                        <p className="text-xs text-gray-400">Cena za osobu</p>
                                        <p className="font-semibold text-gray-800">{fmtAmount(detail.payment.amountPerPerson)}</p>
                                    </div>
                                    <div className="sm:col-span-2">
                                        <p className="text-xs text-gray-400">Částka k úhradě</p>
                                        <p className="text-lg font-semibold text-[#327600]">{fmtAmount(detail.payment.amount)}</p>
                                    </div>
                                    <div className="sm:col-span-2">
                                        <p className="text-xs text-gray-400">Zpráva pro příjemce</p>
                                        <p className="break-words text-sm text-gray-700">{detail.payment.messageForRecipient}</p>
                                    </div>
                                </div>
                            </div>
                        </section>
                    </div>
                </div>

                <div className="text-center text-sm text-[#4a5a42]">
                    Úpravy provedeš přes veřejný formulář.
                    <div className="mt-2">
                        <Link
                            href="/prihlaska/zahranicnivoda"
                            className="inline-flex items-center justify-center rounded-md border border-[#98bf7c] bg-white px-4 py-2 text-sm font-medium text-[#2f4f1e] hover:bg-[#f0f7e8]"
                        >
                            Otevřít formulář přihlášky
                        </Link>
                    </div>
                </div>
            </div>
        </main>
    );
}
