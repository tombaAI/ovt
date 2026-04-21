import Link from "next/link";

export const metadata = {
    title: "OVT Bohemians — Oddíl vodní turistiky",
    description:
        "Oddíl vodní turistiky TJ Bohemians Praha. Kanoistika, vodní turistika a přátelská parta od roku 1948.",
};

export default function HomePage() {
    return (
        <div className="min-h-screen flex flex-col font-sans">
            {/* Navigační lišta */}
            <header style={{ backgroundColor: "#26272b" }} className="sticky top-0 z-50 shadow-md">
                <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <span className="text-white font-bold text-lg tracking-tight">
                            OVT Bohemians
                        </span>
                        <span
                            className="hidden sm:inline text-xs px-2 py-0.5 rounded-full font-medium"
                            style={{ backgroundColor: "#327600", color: "#fff" }}
                        >
                            TJ Bohemians Praha
                        </span>
                    </div>
                    <nav className="flex items-center gap-6 text-sm">
                        <a href="#o-nas" className="text-gray-300 hover:text-white transition-colors">
                            O nás
                        </a>
                        <a href="#aktivita" className="text-gray-300 hover:text-white transition-colors">
                            Co děláme
                        </a>
                        <a href="#pridej-se" className="text-gray-300 hover:text-white transition-colors">
                            Přidej se
                        </a>
                        <Link
                            href="/login"
                            className="text-xs px-3 py-1.5 rounded-md border border-gray-500 text-gray-300 hover:border-white hover:text-white transition-colors"
                        >
                            Přihlásit se
                        </Link>
                    </nav>
                </div>
            </header>

            {/* Hero */}
            <section
                className="relative flex flex-col items-center justify-center text-center py-32 px-4"
                style={{
                    background:
                        "linear-gradient(160deg, #1a2e0a 0%, #27450f 40%, #327600 100%)",
                }}
            >
                <p className="text-sm font-semibold uppercase tracking-widest mb-4" style={{ color: "#82b965" }}>
                    Oddíl vodní turistiky
                </p>
                <h1 className="text-5xl sm:text-7xl font-extrabold text-white mb-6 leading-tight">
                    OVT Bohemians
                </h1>
                <p className="text-lg sm:text-xl text-gray-200 max-w-2xl mb-10">
                    Pádlujeme, cestujeme po vodě a bavíme se spolu.
                    Jsme součástí <strong>TJ Bohemians Praha</strong> a vítáme
                    každého, koho láká řeka, jezero nebo moře.
                </p>
                <div className="flex flex-wrap gap-4 justify-center">
                    <a
                        href="#pridej-se"
                        className="px-6 py-3 rounded-lg font-semibold text-white shadow-lg transition-transform hover:scale-105"
                        style={{ backgroundColor: "#327600" }}
                    >
                        Přidej se k nám
                    </a>
                    <a
                        href="#o-nas"
                        className="px-6 py-3 rounded-lg font-semibold border border-white/40 text-white bg-white/10 hover:bg-white/20 transition-colors"
                    >
                        Více o oddílu
                    </a>
                </div>
            </section>

            {/* O nás */}
            <section id="o-nas" className="py-20 px-4 bg-white">
                <div className="max-w-5xl mx-auto">
                    <h2 className="text-3xl font-bold mb-3" style={{ color: "#26272b" }}>
                        O oddílu
                    </h2>
                    <div
                        className="w-12 h-1 rounded mb-8"
                        style={{ backgroundColor: "#327600" }}
                    />
                    <div className="grid sm:grid-cols-2 gap-10 text-gray-700 leading-relaxed">
                        <div>
                            <p className="mb-4">
                                OVT Bohemians je <strong>oddíl vodní turistiky</strong> působící
                                v rámci TJ Bohemians Praha od roku 1948. Za tu dobu jsme
                                projeli stovky kilometrů řek a potoků po celé Evropě.
                            </p>
                            <p>
                                Naší hlavní náplní je <strong>kanoistika a vodní turistika</strong>{" "}
                                — od jednodenních výletů na Sázavě až po týdenní expedice v zahraničí.
                                Pořádáme pravidelné tréninky, závody i společenské akce.
                            </p>
                        </div>
                        <div>
                            <p className="mb-4">
                                Jsme součástí <strong>TJ Bohemians Praha</strong>, sportovního
                                oddílu se širokou základnou, který sdružuje celou řadu
                                sportovních oddílů. Náš oddíl je otevřený pro všechny věkové
                                kategorie.
                            </p>
                            <p>
                                Vítáme začátečníky i zkušené vodáky. Důraz klademe na
                                přátelskou atmosféru, bezpečnost na vodě a sdílení vášně
                                pro přírodu.
                            </p>
                        </div>
                    </div>
                </div>
            </section>

            {/* Co děláme */}
            <section
                id="aktivita"
                className="py-20 px-4"
                style={{ backgroundColor: "#f5f7f2" }}
            >
                <div className="max-w-5xl mx-auto">
                    <h2 className="text-3xl font-bold mb-3" style={{ color: "#26272b" }}>
                        Co děláme
                    </h2>
                    <div
                        className="w-12 h-1 rounded mb-10"
                        style={{ backgroundColor: "#327600" }}
                    />
                    <div className="grid sm:grid-cols-3 gap-6">
                        {[
                            {
                                icon: "🛶",
                                title: "Vodní turistika",
                                text: "Víkendové a prázdninové výpravy na tuzemských i zahraničních řekách. Plánujeme trasy pro začátečníky i pokročilé.",
                            },
                            {
                                icon: "🏕️",
                                title: "Soustředění a tábory",
                                text: "Letní tábory pro děti a mládež. Výcvikové soustředění na divoké vodě pro pokročilé.",
                            },
                            {
                                icon: "🤝",
                                title: "Oddílový život",
                                text: "Pravidelné schůzky, společné tréninky, brigády a oddílové akce po celý rok.",
                            },
                        ].map((item) => (
                            <div
                                key={item.title}
                                className="bg-white rounded-xl p-6 shadow-sm border border-gray-100"
                            >
                                <div className="text-4xl mb-4">{item.icon}</div>
                                <h3 className="font-bold text-lg mb-2" style={{ color: "#26272b" }}>
                                    {item.title}
                                </h3>
                                <p className="text-gray-600 text-sm leading-relaxed">{item.text}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* Přidej se */}
            <section id="pridej-se" className="py-20 px-4 bg-white">
                <div className="max-w-3xl mx-auto text-center">
                    <h2 className="text-3xl font-bold mb-3" style={{ color: "#26272b" }}>
                        Přidej se k nám
                    </h2>
                    <div
                        className="w-12 h-1 rounded mb-8 mx-auto"
                        style={{ backgroundColor: "#327600" }}
                    />
                    <p className="text-gray-600 leading-relaxed mb-8">
                        Máš zájem o vodní turistiku, kanoistiku nebo jen hledáš
                        partu, se kterou vyrazíš na vodu? Ozvi se nám — jsme otevřený
                        oddíl a uvítáme každého nadšence bez ohledu na věk nebo
                        zkušenosti.
                    </p>
                    <div className="bg-gray-50 rounded-xl p-8 text-left space-y-3 text-sm text-gray-700 mb-8 border border-gray-100">
                        <p>
                            <span className="font-semibold">Kde nás najdeš:</span>{" "}
                            TJ Bohemians Praha, Praha
                        </p>
                        <p>
                            <span className="font-semibold">Kontakt:</span>{" "}
                            <a
                                href="mailto:ovt@bohemianstj.cz"
                                className="hover:underline"
                                style={{ color: "#327600" }}
                            >
                                ovt@bohemianstj.cz
                            </a>
                        </p>
                    </div>
                    <a
                        href="mailto:ovt@bohemianstj.cz"
                        className="inline-block px-8 py-3 rounded-lg font-semibold text-white shadow transition-transform hover:scale-105"
                        style={{ backgroundColor: "#327600" }}
                    >
                        Napsat nám
                    </a>
                </div>
            </section>

            {/* Footer */}
            <footer
                style={{ backgroundColor: "#26272b" }}
                className="mt-auto py-10 px-4 text-gray-400 text-sm"
            >
                <div className="max-w-6xl mx-auto flex flex-col sm:flex-row justify-between gap-6">
                    <div>
                        <p className="text-white font-semibold mb-1">OVT Bohemians</p>
                        <p>Oddíl vodní turistiky · TJ Bohemians Praha</p>
                    </div>
                    <div className="flex flex-col gap-1 text-right">
                        <a
                            href="https://www.bohemianstj.cz"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="hover:text-white transition-colors"
                        >
                            TJ Bohemians Praha ↗
                        </a>
                        <Link
                            href="/login"
                            className="hover:text-white transition-colors"
                        >
                            Přihlásit se do IS
                        </Link>
                    </div>
                </div>
            </footer>
        </div>
    );
}
