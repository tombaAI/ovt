import { HealthPanel } from "./components/health-panel";

const domainPlan = [
  "Web administrace poběží na sprava.ovtbohemians.cz.",
  "Odesílací reputace a DNS pro Resend budou oddělené pod mail.ovtbohemians.cz.",
  "První systémový odesílatel dává smysl jako sprava@mail.ovtbohemians.cz.",
  "Lidská kontaktní schránka může zůstat zvlášť, například sprava@ovtbohemians.cz."
];

const emailFlow = [
  "Odchozí výzvy k platbě a připomínky posílej z adresy pod ověřenou subdoménou mail.ovtbohemians.cz.",
  "Pokud chceš časem automaticky zpracovávat odpovědi, vyhraď si samostatnou inbound adresu, například inbox@mail.ovtbohemians.cz.",
  "Aplikace má už teď počítat s logem e-mailových událostí v databázi, aby šly později napojit Make, n8n nebo vlastní webhooky.",
  "Resend webhooky umí vracet stav doručení a do budoucna i event email.received pro příchozí poštu."
];

const domainAdminChecklist = [
  "Nasměrovat subdoménu sprava.ovtbohemians.cz na Vercel podle cílového DNS záznamu, který Vercel ukáže při přidání domény.",
  "Přidat DNS záznamy, které Resend vygeneruje pro ověření mail.ovtbohemians.cz, typicky SPF a DKIM a ideálně i DMARC.",
  "Rozhodnout, zda lidská schránka bude sprava@ovtbohemians.cz nebo sprava@mail.ovtbohemians.cz, a podle toho zajistit mailbox nebo forwarding.",
  "Pokud se má časem automaticky zpracovávat příchozí pošta, připravit i samostatnou adresu jako inbox@mail.ovtbohemians.cz a dohodnout, zda povede do webhooku nebo do mailboxu s další automatizací."
];

export default function HomePage() {
  return (
    <main className="shell">
      <section className="hero">
        <p className="eyebrow">OVT interni sprava</p>
        <h1>Prvni dummy aplikace pro technicke overeni</h1>
        <p className="lead">
          Tenhle základ slouží jen k tomu, aby se co nejdřív ověřilo, že funguje web, spojení do PostgreSQL a připravenost e-mailového setupu pro <code>sprava.ovtbohemians.cz</code> a <code>mail.ovtbohemians.cz</code>.
        </p>
        <div className="heroMeta">
          <span>Next.js App Router</span>
          <span>Fluent UI v9</span>
          <span>Server-side PostgreSQL</span>
          <span>Resend ready</span>
        </div>
      </section>

      <HealthPanel />

      <section className="contentGrid" aria-label="Domény a e-mailový model">
        <article className="panel">
          <h2>Doménový model</h2>
          <p>
            Pro první ostrý setup dává nejčistší smysl oddělit admin web a mailovou reputaci. Web zůstane na <code>sprava.ovtbohemians.cz</code>, zatímco odesílání a případná příchozí automatizační pošta poběží pod <code>mail.ovtbohemians.cz</code>.
          </p>
          <ul className="list">
            {domainPlan.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </article>

        <article className="panel">
          <h2>E-mailová logika</h2>
          <p>
            Pro tenhle projekt nedává smysl začínat s <code>noreply</code> jako hlavní adresou. Praktická varianta je mít odesílatele, na kterého se dá odpovědět, a až vedle toho technické adresy pro automatizaci.
          </p>
          <ul className="list">
            {emailFlow.map((item) => (
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
          </div>
        </article>
      </section>

      <section className="panel panelWide">
        <h2>Co bude později chtít admin domény</h2>
        <p>
          Jakmile budeš chtít od admina domény konkrétní nastavení, tahle dummy aplikace už bude dobrý ověřovací bod. Bude jasné, jaké subdomény existují a co přesně má být nasměrované nebo ověřené.
        </p>
        <ol className="steps">
          {domainAdminChecklist.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ol>
      </section>
    </main>
  );
}
