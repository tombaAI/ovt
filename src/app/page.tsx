import { HealthPanel } from "./components/health-panel";

const firstDeployPlan = [
    "První deploy klidně poběží jen na dočasné adrese z Vercelu, bez vlastní domény a bez e-mailu.",
    "Pro běh aplikace teď stačí DATABASE_URL a ADMIN_EMAILS. APP_BASE_URL je zatím volitelné.",
    "Databáze se ověřuje server-side přes PostgreSQL spojení, ne přes klientský Supabase SDK.",
    "Jakmile doběhne první deploy a migrace, health endpointy ukážou skutečný stav aplikace i databáze."
];

const requiredSetup = [
    "GitHub repozitář je připravený na branchi main a Vercel ho může importovat přímo z GitHubu.",
    "Na Supabase je potřeba mít aplikovanou první SQL migraci ze složky supabase/migrations.",
    "Na Vercelu je potřeba nastavit environment variables pro produkci.",
    "Po deployi zkontroluj stránku /api/health/db a hlavní dashboard dummy aplikace."
];

const laterSetup = [
    "Vlastní doménu sprava.ovtbohemians.cz přidej až po prvním ověření na vercel.app URL.",
    "Resend můžeš teď technicky otestovat přes onboarding@resend.dev, ale vlastní mailovou subdoménu nech až do další etapy.",
    "Google login zatím neřeš. Pro první deploy není potřeba ani v GitHubu, ani ve Vercelu, ani v Supabase nic kolem OAuth nastavovat.",
    "Až bude hotový základ aplikace, teprve potom má smysl chystat DNS zadání pro admina domény."
];

export default function HomePage() {
    return (
        <main className="shell">
            <section className="hero">
                <p className="eyebrow">OVT interni sprava</p>
                <h1>Prvni deploy webu s databazi</h1>
                <p className="lead">
                    Tenhle základ slouží k prvnímu ověření, že funguje web na Vercelu a server-side spojení do PostgreSQL v Supabase. E-mailing a vlastní doména zůstanou zatím vypnuté.
                </p>
                <div className="heroMeta">
                    <span>Next.js App Router</span>
                    <span>Fluent UI v9</span>
                    <span>Server-side PostgreSQL</span>
                    <span>Resend test mode ready</span>
                </div>
            </section>

            <HealthPanel />

            <section className="contentGrid" aria-label="První deploy a co je potřeba">
                <article className="panel">
                    <h2>Co je cílem teď</h2>
                    <p>
                        První deploy nemá řešit celou infrastrukturu. Cíl je prostý: otevřít web na Vercelu, vidět hlavní stránku a potvrdit, že backend opravdu sáhne do databáze a pozná, jestli je nahraná první migrace.
                    </p>
                    <ul className="list">
                        {firstDeployPlan.map((item) => (
                            <li key={item}>{item}</li>
                        ))}
                    </ul>
                </article>

                <article className="panel">
                    <h2>Co musí být nastavené</h2>
                    <p>
                        Bez těchto čtyř kroků první deploy nedává smysl pouštět. Jakmile jsou splněné, stránka i API endpointy už umí technický stav ukázat přímo z nasazené aplikace.
                    </p>
                    <ul className="list">
                        {requiredSetup.map((item) => (
                            <li key={item}>{item}</li>
                        ))}
                    </ul>
                    <div className="endpointRow">
                        <a className="endpointLink" href="/api/health">
                            /api/health
                        </a>
                        <a className="endpointLink" href="/api/health/db">
                            /api/health/db
                        </a>
                        <a className="endpointLink" href="/api/health/email">
                            /api/health/email
                        </a>
                        <a className="endpointLink" href="/api/email/test">
                            /api/email/test
                        </a>
                    </div>
                </article>
            </section>

            <section className="panel panelWide">
                <h2>Co nech zatím na později</h2>
                <p>
                    Tenhle krok je schválně odložený. Nejprve ověř web a databázi na dočasné Vercel URL. Teprve až tohle poběží, má smysl řešit vlastní doménu, DNS a e-mailové workflow.
                </p>
                <ol className="steps">
                    {laterSetup.map((item) => (
                        <li key={item}>{item}</li>
                    ))}
                </ol>
            </section>
        </main>
    );
}

