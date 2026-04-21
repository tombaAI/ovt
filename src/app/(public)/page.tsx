import Link from "next/link";

export const metadata = {
    title: "OVT Bohemians — Oddíl vodní turistiky",
    description:
        "Kamarádský oddíl vodáků v Praze Podolí. Sjíždíme řeky u nás i v zahraničí, jezdíme na hory a každou středu hrajeme sporty v tělocvičně.",
};

export default function HomePage() {
    return (
        <div className="min-h-screen flex flex-col font-sans">
            {/* Navigační lišta */}
            <header style={{ backgroundColor: "#26272b" }} className="sticky top-0 z-50 shadow-md">
                <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <span className="text-white font-bold text-lg tracking-tight">OVT Bohemians</span>
                        <span
                            className="hidden sm:inline text-xs px-2 py-0.5 rounded-full font-medium"
                            style={{ backgroundColor: "#327600", color: "#fff" }}
                        >
                            TJ Bohemians Praha
                        </span>
                    </div>
                    <nav className="flex items-center gap-5 text-sm">
                        <a href="#o-nas" className="text-gray-300 hover:text-white transition-colors">O nás</a>
                        <a href="#aktivita" className="text-gray-300 hover:text-white transition-colors">Co děláme</a>
                        <a href="#historie" className="text-gray-300 hover:text-white transition-colors">Historie</a>
                        <a href="#pridej-se" className="text-gray-300 hover:text-white transition-colors">Přidej se</a>
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
                style={{ background: "linear-gradient(160deg, #1a2e0a 0%, #27450f 40%, #327600 100%)" }}
            >
                <p className="text-sm font-semibold uppercase tracking-widest mb-4" style={{ color: "#82b965" }}>
                    Oddíl vodní turistiky
                </p>
                <h1 className="text-5xl sm:text-7xl font-extrabold text-white mb-6 leading-tight">
                    OVT Bohemians
                </h1>
                <p className="text-lg sm:text-xl text-gray-200 max-w-2xl mb-10">
                    Jsme kamarádský oddíl vodáků v pražském Podolí.
                    Sjíždíme krásné řeky u nás i v zahraničí, jezdíme lyžovat do Jizerských hor
                    a každou středu se potkáváme v tělocvičně.
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
                    <h2 className="text-3xl font-bold mb-3" style={{ color: "#26272b" }}>O oddílu</h2>
                    <div className="w-12 h-1 rounded mb-8" style={{ backgroundColor: "#327600" }} />
                    <div className="grid sm:grid-cols-2 gap-10 text-gray-700 leading-relaxed">
                        <div>
                            <p className="mb-4">
                                Vítej na stránkách oddílu vodní turistiky při{" "}
                                <strong>Tělovýchovné jednotě Bohemians Praha</strong>.
                                Jsme pro všechny, kteří mají rádi aktivní život a preferují zážitky před pohodlím.
                            </p>
                            <p className="mb-4">
                                Jsme především vodáci — pokud to jde, sjíždíme krásné řeky různých obtížností
                                u nás i v zahraničí. Nevyhýbáme se ale ani tréninku na slalomových kanálech,
                                cyklistice, horské turistice či lezení. Procvičujeme i praktickou záchranu na vodě.
                            </p>
                            <p>
                                V zimě pravidelně chodíme do bazénu v Praze&nbsp;6 – Suchdole,
                                kde cvičíme <strong>eskymácké obraty</strong>. Pořádáme také lyžařské akce.
                            </p>
                        </div>
                        <div>
                            <p className="mb-4">
                                Naším cílem není závodní výkonnost, ale <strong>dobrá přátelství a zážitky</strong>{" "}
                                vzniklé při sportu a venkovních aktivitách.
                            </p>
                            <p className="mb-4">
                                Zázemím nám slouží <strong>loděnice v Podolí</strong> na Modřanské ulici
                                vedle Žlutých lázní. Celoročně zde probíhají oddílové schůzky,
                                florbal a různé pohybové hry. Díky oddílu lyžařské turistiky TJ Bohemians
                                jezdíme také na chatu v Jiřetíně pod Bukovou.
                            </p>
                            <p>
                                Pro děti a mládež máme <strong>turistický oddíl mládeže (TOM)</strong>{" "}
                                se speciálním programem. Rostou z nich skvělí lidé — samostatní
                                a zodpovědní — a mnozí se pak přidají i do dospělého oddílu.
                            </p>
                        </div>
                    </div>
                </div>
            </section>

            {/* Co děláme */}
            <section id="aktivita" className="py-20 px-4" style={{ backgroundColor: "#f5f7f2" }}>
                <div className="max-w-5xl mx-auto">
                    <h2 className="text-3xl font-bold mb-3" style={{ color: "#26272b" }}>Co děláme</h2>
                    <div className="w-12 h-1 rounded mb-10" style={{ backgroundColor: "#327600" }} />
                    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
                        {[
                            {
                                icon: "🛶",
                                title: "Vodní turistika",
                                text: "Sjíždíme řeky různých obtížností u nás i v zahraničí. Vrcholem je každoroční jarní zájezd do Alp — Rakousko, Švýcarsko a dalších zemí.",
                            },
                            {
                                icon: "🏆",
                                title: "Hamerský potok",
                                text: "Každoročně pořádáme oblíbený závod zařazený do Českého poháru vodáků na Hamerském potoce u Jindřichova Hradce.",
                            },
                            {
                                icon: "🌊",
                                title: "Eskymácké obraty",
                                text: "V zimě cvičíme eskymácké obraty v bazénu v Praze 6 – Suchdole. Patří to k základní výbavě každého správného vodáka.",
                            },
                            {
                                icon: "⛷️",
                                title: "Lyžování",
                                text: "Jezdíme do Jizerských hor na chatu oddílu lyžařské turistiky TJ Bohemians. Víkendy s dětmi i dospělými po celou zimu.",
                            },
                            {
                                icon: "🏐",
                                title: "Každou středu",
                                text: "Každou středu se potkáváme v tělocvičně v loděnici v Podolí — florbal a různé pohybové hry. Přes zimu se nesmí zakrnět.",
                            },
                            {
                                icon: "👦",
                                title: "Oddíl mládeže (TOM)",
                                text: "Turistický oddíl mládeže s programem pro děti i dorost do 18 let. Vodáci budoucnosti vyrůstají s námi.",
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

            {/* Historie */}
            <section id="historie" className="py-20 px-4 bg-white">
                <div className="max-w-4xl mx-auto">
                    <h2 className="text-3xl font-bold mb-3" style={{ color: "#26272b" }}>Něco z historie</h2>
                    <div className="w-12 h-1 rounded mb-10" style={{ backgroundColor: "#327600" }} />
                    <div className="space-y-6 text-gray-700 leading-relaxed">
                        <p>
                            Prvopočátky našeho oddílu sahají do <strong>50. let minulého století</strong>,
                            kdy se spojil oddíl Spartak Stalingrad se Sokolem Vinohrady. Tehdy na vodu
                            jezdili hlavně lyžaři, pro které byl vodní sport letním doplňkem.
                            Postupně se formoval oddíl turistiky z nezávodících členů.
                        </p>
                        <p>
                            Vrcholem činnosti oddílu se stala <strong>léta 1970–1990</strong>.
                            Členové jezdili na řeky obtížnosti WW&nbsp;4–5, pravidelně se účastnili
                            VTJZ, pořádali sjezd Botiče v Praze a jezdili na zahraniční vody —
                            Rumunsko, Jugoslávii, Rakousko. Technici-nadšenci vyráběli vlastní
                            lodě (kopyta &bdquo;pošovky&ldquo; a &bdquo;Bohemky&ldquo;) a oddíl
                            měl i výbornou kapelu, která se schází dodnes.
                        </p>
                        <p>
                            V letech <strong>1990–91 oddíl málem zanikl</strong>. Zbyli tři členové.
                            Ti se ale nevzdali — dohodli se s vedoucím oddílu mládeže a pustili se
                            do obnovy. Základem se stalo pravidelné pořádání zájezdů autobusem
                            a začlenění vodní turistiky Fyzikálního ústavu. Postupně se podařilo
                            získat zpět krakorce, klubovnu a přilákat nové členy.
                        </p>
                        <p>
                            Dnes má oddíl <strong>přes 40 aktivních členů</strong>, fungující oddíl
                            mládeže a každoroční pořádání Hamerského potoka v seriálu Českého
                            poháru vodáků. Oddíl žije a daří se mu — pokud nevopakuje chyby
                            minulosti a pečlivě se stará o mládež.
                        </p>
                        <p className="text-sm text-gray-500 italic">
                            Text z pera Pavla Šálka (Ešuse), s pomocí Jirky Kellera.
                        </p>
                    </div>
                </div>
            </section>

            {/* Přidej se */}
            <section id="pridej-se" className="py-20 px-4" style={{ backgroundColor: "#f5f7f2" }}>
                <div className="max-w-3xl mx-auto text-center">
                    <h2 className="text-3xl font-bold mb-3" style={{ color: "#26272b" }}>Přidej se k nám</h2>
                    <div className="w-12 h-1 rounded mb-8 mx-auto" style={{ backgroundColor: "#327600" }} />
                    <p className="text-gray-600 leading-relaxed mb-8">
                        Pokud tě naše plány zaujaly, neváhej a ozvi se. Nábor probíhá průběžně po celý rok.
                        Buď nám napiš e-mailem, nebo přijď <strong>kteroukoli středu</strong> přímo k nám
                        do loděnice v Podolí — adresu najdeš níže.
                    </p>
                    <div className="bg-white rounded-xl p-8 text-left space-y-3 text-sm text-gray-700 mb-8 border border-gray-100 shadow-sm">
                        <p>
                            <span className="font-semibold">Kde nás najdeš:</span>{" "}
                            Loděnice v Podolí, Modřanská ul., Praha (vedle Žlutých lázní)
                        </p>
                        <p>
                            <span className="font-semibold">Kdy:</span>{" "}
                            Každou středu — tělocvična a oddílové schůzky
                        </p>
                        <p>
                            <span className="font-semibold">E-mail:</span>{" "}
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
            <footer style={{ backgroundColor: "#26272b" }} className="mt-auto py-10 px-4 text-gray-400 text-sm">
                <div className="max-w-6xl mx-auto flex flex-col sm:flex-row justify-between gap-6">
                    <div>
                        <p className="text-white font-semibold mb-1">OVT Bohemians</p>
                        <p>Oddíl vodní turistiky · TJ Bohemians Praha</p>
                    </div>
                    <div className="flex flex-col gap-1 sm:text-right">
                        <a
                            href="https://www.bohemianstj.cz"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="hover:text-white transition-colors"
                        >
                            TJ Bohemians Praha ↗
                        </a>
                        <Link href="/login" className="hover:text-white transition-colors">
                            Přihlásit se do IS
                        </Link>
                    </div>
                </div>
            </footer>
        </div>
    );
}
