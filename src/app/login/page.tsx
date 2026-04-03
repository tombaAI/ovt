import { signIn } from "@/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

export default async function LoginPage({
    searchParams
}: {
    searchParams: Promise<{ error?: string }>;
}) {
    const { error } = await searchParams;
    const isAccessDenied = error === "AccessDenied";

    return (
        <main className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
            <div className="w-full max-w-sm space-y-6">
                <div className="text-center space-y-1">
                    <div className="inline-flex items-center gap-2 mb-2">
                        <span className="text-3xl font-bold text-[#327600]">OVT</span>
                        <span className="text-3xl font-light text-gray-400">Bohemians</span>
                    </div>
                    <p className="text-sm text-gray-500">Správa klubu</p>
                </div>

                <Card>
                    <CardHeader className="pb-2">
                        <p className="text-sm text-gray-600 text-center">
                            Přihlášení je dostupné pouze pro správce klubu.
                        </p>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {isAccessDenied && (
                            <p className="text-sm text-red-600 bg-red-50 rounded-md px-3 py-2 text-center">
                                Tvůj účet nemá přístup do správy. Kontaktuj administrátora.
                            </p>
                        )}
                        <form
                            action={async () => {
                                "use server";
                                await signIn("google", { redirectTo: "/dashboard" });
                            }}
                        >
                            <Button type="submit" className="w-full bg-[#327600] hover:bg-[#2a6300]">
                                Přihlásit se přes Google
                            </Button>
                        </form>
                    </CardContent>
                </Card>
                <a href="/health" className="text-xs text-gray-400 hover:text-gray-600 block text-center">
                    Stav aplikace
                </a>
            </div>
        </main>
    );
}
