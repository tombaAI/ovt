import { getForeignWaterFormContext } from "@/lib/actions/event-registrations";
import { ForeignWaterRegistrationForm } from "./registration-form";

export const metadata = {
    title: "Přihláška na akci - Zahraniční voda",
    description: "Přihláška na zahraniční vodáckou akci OVT Bohemians.",
};

export const dynamic = "force-dynamic";

export default async function ForeignWaterRegistrationPage() {
    const context = await getForeignWaterFormContext();

    return (
        <main className="min-h-screen bg-[radial-gradient(circle_at_top,_#eef8e6,_#f5f7f2_45%,_#ffffff)] px-4 py-10 sm:py-14">
            <div className="mx-auto w-full max-w-3xl">
                <ForeignWaterRegistrationForm context={context} />
            </div>
        </main>
    );
}
