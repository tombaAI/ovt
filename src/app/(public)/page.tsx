import Image from "next/image";
import { ContactForm } from "./contact-form";

export const metadata = {
    title: "OVT Bohemians — Oddíl vodní turistiky",
    description:
        "Kamarádský oddíl vodáků v Praze Podolí. Sjíždíme řeky u nás i v zahraničí, pořádáme závod Hamerský potok a jezdíme na chatu do Jizerských hor.",
};

export default function HomePage() {
    return (
        <div className="min-h-screen flex flex-col font-sans">
            {/* Navigační lišta */}
            <header style={{ backgroundColor: "#26272b" }} className="sticky top-0 z-50 shadow-md">
                <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Image src="/logo-bohemians.png" alt="OVT Bohemians" width={36} height={36} className="shrink-0" />
                        <span className="text-white font-bold text-lg tracking-tight">OVT Bohemians</span>
                    </div>
                    <nav className="flex items-center gap-5 text-sm">
                        <a href="#o-nas" className="text-gray-300 hover:text-white transition-colors">O nás</a>
                        <a href="#hamerak" className="text-gray-300 hover:text-white transition-colors">Hamerák</a>
                        <a href="#aktivita" className="text-gray-300 hover:text-white transition-colors">Co děláme</a>
                        <a href="#historie" className="text-gray-300 hover:text-white transition-colors">Historie</a>
                        <a href="#pridej-se" className="text-gray-300 hover:text-white transition-colors">Přidej se</a>
                        <a
                            href="https://is.ovtbohemians.cz/login"
                            className="text-xs px-3 py-1.5 rounded-md border border-gray-500 text-gray-300 hover:border-white hover:text-white transition-colors"
                        >
                            Přihlásit se
                        </a>
                    </nav>
                </div>
            </header>

            {/* Hero */}
            <section className="relative flex flex-col items-center justify-center text-center py-32 px-4 overflow-hidden min-h-[480px]">
                {/* Fotka na pozadí */}
                <Image
                    src="/foto-ovt.jpg"
                    alt=""
                    fill
                    className="object-cover object-center"
                    priority
                />
                {/* Tmavě zelený překryv */}
                <div
                    className="absolute inset-0"
                    style={{ background: "linear-gradient(160deg, rgba(26,46,10,0.82) 0%, rgba(39,69,15,0.75) 50%, rgba(50,118,0,0.65) 100%)" }}
                />
                {/* Obsah */}
                <div className="relative z-10">
                    <p className="text-sm font-semibold uppercase tracking-widest mb-4" style={{ color: "#82b965" }}>
                        Kanoistika · Český pohár vodáků · TJ Bohemians Praha
                    </p>
                    <h1 className="text-5xl sm:text-7xl font-extrabold text-white mb-6 leading-tight">
                        OVT Bohemians
                    </h1>
                    <p className="text-lg sm:text-xl text-gray-200 max-w-2xl mb-10">
                        Jsme kamarádský oddíl vodáků v pražském Podolí.
                        Sjíždíme řeky u nás i v zahraničí, každoročně pořádáme
                        závod <strong>Hamerský potok</strong> a jezdíme na chatu do Jizerských hor.
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
                            href="#hamerak"
                            className="px-6 py-3 rounded-lg font-semibold border border-white/40 text-white bg-white/10 hover:bg-white/20 transition-colors"
                        >
                            Hamerský potok 2026 ↓
                        </a>
                    </div>
                </div>
            </section>

            {/* O nás */}
            <section id="o-nas" className="py-20 px-4 bg-white">
                <div className="max-w-5xl mx-auto">
                    <h2 className="text-3xl font-bold mb-3" style={{ color: "#26272b" }}>O oddílu</h2>
                    <div className="w-12 h-1 rounded mb-8" style={{ backgroundColor: "#327600" }} />
                    <div className="grid sm:grid-cols-2 gap-10 text-gray-700 leading-relaxed">
                        <div className="space-y-4">
                            <p>
                                Jsme vodácký oddíl při{" "}
                                <a href="https://www.bohemianstj.cz" target="_blank" rel="noopener noreferrer" className="underline" style={{ color: "#327600" }}>TJ Bohemians Praha</a>.
                                Jsme pro všechny, kteří mají rádi aktivní život a preferují zážitky před pohodlím.
                            </p>
                            <p>
                                Pokud to jde, sjíždíme krásné řeky různých obtížností u nás i v zahraničí.
                                Nevyhýbáme se ale ani slalomovým kanálům, krajinově velkolepým řekám i sjezdům s dětmi.
                                Procvičujeme i praktickou záchranu na vodě.
                            </p>
                            <p>
                                Zázemím nám slouží <strong>loděnice v Podolí</strong> na Modřanské ulici
                                vedle Žlutých lázní, kde se celoročně potkáváme.
                                Naším cílem není závodní výkonnost, ale <strong>zážitky a přátelství</strong>{" "}
                                vzniklé při sportu. Oddíl má přes 50 aktivních členů.
                            </p>
                        </div>
                        <div className="space-y-4">
                            <p>
                                Účastníme se seriálu{" "}
                                <strong>Českého poháru vodáků (ČPV)</strong> — celostátní série závodů
                                na divoké vodě. Závodit nás baví a Hamerák pořádáme s tím samým zápalem.
                            </p>
                            <p>
                                Na vodáckých akcích spolupracujeme s{" "}
                                <a href="https://klokani-bohemians.cz/" target="_blank" rel="noopener noreferrer" className="underline" style={{ color: "#327600" }}>Turistickým oddílem mládeže (TOM) TJ Bohemians</a>,{" "}
                                který je přirozenou líhní budoucích vodáků — mnoho dnešních členů OVT prošlo právě TOMem.
                            </p>
                            <p>
                                S{" "}
                                <a href="https://www.bohemianstj.cz/lyzarska-turistka/" target="_blank" rel="noopener noreferrer" className="underline" style={{ color: "#327600" }}>Oddílem lyžařské turistiky TJ Bohemians</a>{" "}
                                jezdíme na chatu v Jiřetíně pod Bukovou v Jizerských horách — v zimě lyžovat, na jaře na kolo, v létě na dovolenou a na podzim pouštět draky (a na brigádu).
                            </p>
                        </div>
                    </div>
                </div>
            </section>

            {/* Hamerák — prominentní sekce */}
            <section
                id="hamerak"
                className="py-20 px-4"
                style={{ backgroundColor: "#26272b" }}
            >
                <div className="max-w-5xl mx-auto">
                    <div className="flex flex-col lg:flex-row gap-10 items-start">
                        <div className="flex-1">
                            <p className="text-sm font-semibold uppercase tracking-widest mb-3" style={{ color: "#82b965" }}>
                                Pořadatelé i závodníci
                            </p>
                            <h2 className="text-3xl sm:text-4xl font-extrabold text-white mb-4">
                                ČPV Hamerský potok
                            </h2>
                            <div className="w-12 h-1 rounded mb-6" style={{ backgroundColor: "#327600" }} />
                            <div className="text-gray-300 leading-relaxed space-y-4">
                                <p>
                                    <strong className="text-white">Český pohár vodáků (ČPV)</strong> je
                                    celostátní seriál závodů na divoké vodě — nejvyšší domácí soutěž
                                    v kanoistice. Naši závodníci se ho účastní každou sezónu.
                                </p>
                                <p>
                                    A navíc: každoročně na podzim jsme i <strong className="text-white">pořadateli</strong> —
                                    závod <strong className="text-white">ČPV Hamerský potok</strong> na Hamerském potoce
                                    u Jindřichova Hradce pořádáme celou sezónu a sejde se na něm přes 700 vodáků z celé republiky.
                                </p>
                                <p className="text-sm" style={{ color: "#82b965" }}>
                                    Letošní ročník se koná <strong>3. – 4. října 2026</strong> — těšíme se!
                                </p>
                            </div>
                        </div>
                        <div className="lg:w-80 flex flex-col gap-4">
                            <a
                                href="https://hamerak.cz"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="block px-6 py-4 rounded-xl text-center font-semibold text-white transition-transform hover:scale-105"
                                style={{ backgroundColor: "#327600" }}
                            >
                                Web závodu →<br />
                                <span className="text-sm font-normal opacity-80">hamerak.cz</span>
                            </a>
                            <div className="rounded-xl border border-gray-600 px-6 py-4 text-sm text-gray-400 space-y-1">
                                <p className="text-white font-semibold mb-2">Informace</p>
                                <p>📍 Hamerský potok, Malý Ratmírov</p>
                                <p>📅 3. – 4. října 2026</p>
                                <p>🏆 Seriál ČPV</p>
                                <p>🛶 700 vodáků, 300 závodníků</p>
                            </div>
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
                                text: "Sjíždíme řeky různých obtížností u nás i v zahraničí. Vrcholem je každoroční jarní zájezd — Rakousko, Švýcarsko a další alpské země.",
                            },
                            {
                                icon: "🏐",
                                title: "Každou středu",
                                text: "Každou středu se potkáváme v tělocvičně v loděnici v Podolí — florbal a pohybové hry.",
                            },
                            {
                                icon: "⛷️",
                                title: "Lyžování v Jizerách",
                                text: "Jezdíme s Oddílem lyžařské turistiky TJ Bohemians na chatu v Jiřetíně pod Bukovou — v zimě lyžovat, na jaře na kolo, v létě na dovolenou a na podzim pouštět draky (a na brigádu).",
                            },
                            {
                                icon: "🚵",
                                title: "Další sporty",
                                text: "Nevyhýbáme se cyklistice, turistice, chillistice. Procvičujeme i praktickou záchranu na vodě.",
                            },
                            {
                                icon: "🏕️",
                                title: "Oddílové akce",
                                text: "Víkendové výjezdy pořádané přímo členy oddílu — stále se něco děje. Jednotlivé akce nejsou povinné, ale je škoda na nich chybět.",
                            },
                            {
                                icon: "🏆",
                                title: "Hamerský potok",
                                text: "Náš vlastní závod v seriálu ČPV. Velká akce, na kterou se připravujeme celou sezónu. Přijď se podívat nebo závodit!",
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
                    <div className="w-12 h-1 rounded mb-8" style={{ backgroundColor: "#327600" }} />
                    <p className="text-gray-700 leading-relaxed mb-6">
                        Oddíl má kořeny v <strong>50. letech minulého století</strong>. Svůj vrchol zažil
                        v letech <strong>1970–1990</strong>, kdy členové sjížděli řeky WW&nbsp;4–5,
                        pořádali závody v Praze i zahraničí a měli i výbornou kapelu.
                        Po téměř zániku v roce <strong>1991</strong> (zbyli tři členové!) se oddíl
                        obnovil, získal Hamerský potok do ČPV a dnes má přes 50 aktivních vodáků.
                    </p>
                    <details className="group">
                        <summary
                            className="cursor-pointer inline-flex items-center gap-2 text-sm font-semibold select-none"
                            style={{ color: "#327600" }}
                        >
                            <span className="group-open:hidden">▶ Číst celou historii</span>
                            <span className="hidden group-open:inline">▼ Skrýt historii</span>
                        </summary>
                        <div className="mt-6 space-y-4 text-gray-700 leading-relaxed text-sm border-l-2 pl-6" style={{ borderColor: "#82b965" }}>
                            <p>
                                Fakticky se dá vystopovat prvopočátek našeho oddílu až do 50. let minulého
                                století. Tehdy se spojil oddíl Spartak Stalingrad se Sokolem Vinohrady.
                                Na vodu tehdy jezdili hlavně lyžaři, kteří považovali vodu v létě za dobrý
                                doplňkový sport. Jeden z tehdejších aktivních vodáků, L.&nbsp;Chrpa,
                                pořádal i zájezdy na řeky. Postupně se začal tvořit oddíl turistiky
                                z nezávodících členů.
                            </p>
                            <p>
                                Turistiku tenkrát definoval ČSTV jako samostatnou složku a jednotlivé
                                odbory začaly využívat podniková nákladní auta pro dopravu na vodu.
                                Oddíl vodní a lyžařské turistiky byl tenkrát velmi úzce provázán
                                a současně fungoval oddíl mládeže.
                            </p>
                            <p>
                                Vrcholem činnosti se stala léta <strong>1970–1990</strong>, kdy se oddíl
                                účastnil pravidelně VTJZ, pořádal sjezd Botiče, jezdil týden co týden
                                na vodu a část členů jezdila obtížnosti WW&nbsp;4–5. Pořádaly se letní
                                zájezdy — Rumunsko, Jugoslávie, Rakousko. Technici-nadšenci vyráběli
                                vlastní lodě (kopyta &bdquo;pošovky&ldquo; a &bdquo;Bohemky&ldquo;). Oddíl měl i výbornou kapelu,
                                která se schází dodnes.
                            </p>
                            <p>
                                V letech <strong>1990–91 oddíl málem zanikl</strong>. Zbyli tři členové.
                                Ti se dohodli s vedoucím oddílu mládeže Jirkou Klímou a pustili se
                                do obnovy — základem se stalo pořádání zájezdů autobusem a začlenění
                                vodní turistiky Fyzikálního ústavu. Podařilo se získat zpět krakorce
                                i klubovnu.
                            </p>
                            <p>
                                Postupně si lidi zvykli, že se opravdu na zájezd jede, mládež přestala
                                přecházet jinam a začala pravidelně doplňovat dospělé. Poslední třešinkou
                                na dortu se stalo převzetí pořádání Hamerského potoka a jeho prosazení
                                do seriálu Českého poháru vodáků.
                            </p>
                            <p className="text-gray-500 italic">
                                Text sepsal Pavel Šálek (Ešus) s pomocí Jirky Kellera.
                            </p>
                        </div>
                    </details>
                </div>
            </section>

            {/* Přidej se */}
            <section id="pridej-se" className="py-20 px-4" style={{ backgroundColor: "#f5f7f2" }}>
                <div className="max-w-3xl mx-auto">
                    <h2 className="text-3xl font-bold mb-3 text-center" style={{ color: "#26272b" }}>Přidej se k nám</h2>
                    <div className="w-12 h-1 rounded mb-6 mx-auto" style={{ backgroundColor: "#327600" }} />
                    <p className="text-gray-600 leading-relaxed mb-8 text-center">
                        Pokud tě naše plány zaujaly, napiš nám. Nábor probíhá průběžně po celý rok.
                    </p>
                    <ContactForm />
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
                        <a href="https://www.bohemianstj.cz" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">TJ Bohemians Praha ↗</a>
                        <a href="https://klokani-bohemians.cz/" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">TOM Bohemians (mládež) ↗</a>
                        <a href="https://hamerak.cz" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">Hamerský potok ↗</a>
                        <a href="https://is.ovtbohemians.cz/login" className="hover:text-white transition-colors">Přihlásit se do IS</a>
                    </div>
                </div>
            </footer>
        </div>
    );
}
