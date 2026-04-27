import { notFound } from "next/navigation";
import {
    getForeignWaterFormContext,
    getForeignWaterRegistrationByToken,
} from "@/lib/actions/event-registrations";
import {
    ForeignWaterRegistrationForm,
    type ForeignWaterRegistrationFormPrefill,
} from "./registration-form";

export const metadata = {
    title: "Přihláška na akci - Zahraniční voda",
    description: "Přihláška na zahraniční vodáckou akci OVT Bohemians.",
};

export const dynamic = "force-dynamic";

export default async function ForeignWaterRegistrationPage({
    searchParams,
}: {
    searchParams: Promise<{ token?: string }>;
}) {
    const [params, context] = await Promise.all([
        searchParams,
        getForeignWaterFormContext(),
    ]);

    let prefill: ForeignWaterRegistrationFormPrefill | null = null;

    if (params.token) {
        const detail = await getForeignWaterRegistrationByToken(params.token);
        if (!detail) notFound();

        prefill = {
            registrationId: detail.registrationId,
            registrationToken: detail.registrationToken,
            firstName: detail.registrant.firstName,
            lastName: detail.registrant.lastName,
            email: detail.registrant.email,
            phone: detail.registrant.phone ?? "",
            additionalPersons: detail.participants
                .filter((participant) => !participant.isPrimary)
                .map((participant) => participant.fullName),
            transportInfo: detail.transportInfo ?? "",
        };
    }

    return (
        <main className="min-h-screen bg-[radial-gradient(circle_at_top,_#eef8e6,_#f5f7f2_45%,_#ffffff)] px-4 py-10 sm:py-14">
            <div className="mx-auto w-full max-w-3xl">
                <ForeignWaterRegistrationForm context={context} prefill={prefill} />
            </div>
        </main>
    );
}
