/**
 * HTML šablona emailu s předpisem příspěvků pro člena OVT.
 * QR kód pro platbu je generován přes Paylibo API.
 */

export type ContribEmailData = {
    firstName:          string;
    lastName:           string;
    year:               number;
    amountTotal:        number;
    amountBase:         number | null;
    amountBoat1:        number | null;
    amountBoat2:        number | null;
    amountBoat3:        number | null;
    discountCommittee:  number | null;
    discountTom:        number | null;
    discountIndividual: number | null;
    brigadeSurcharge:   number | null;
    variableSymbol:     number | null;
    bankAccount:        string;         // "2701772934/2010"
    dueDate:            string | null;  // ISO date
};

// ── Formatovací funkce ────────────────────────────────────────────────────────

function fmt(n: number): string {
    return n.toLocaleString("cs-CZ") + "\u00a0Kč";   // nezlomitelná mezera před Kč
}

function fmtDate(iso: string): string {
    const [y, m, d] = iso.split("-");
    return `${Number(d)}.\u00a0${Number(m)}.\u00a0${y}`;
}

/**
 * Sestaví plný 9místný VS: 207 (oddíl) + 101 (příspěvky) + 3 cifry z člena.
 * Pokud je vs už 9místné (tj. ≥ 100_000_000), použije se přímo.
 */
function buildFullVS(vs: number): number {
    if (vs >= 100_000_000) return vs;        // už plný formát
    return 207_101_000 + (vs % 1000);        // 207101 + 3 cifry
}

/** Formátuje variabilní symbol jako "207 101 021". */
function fmtVS(vs: number): string {
    const full = String(buildFullVS(vs)).padStart(9, "0");
    return full.replace(/(\d{3})(\d{3})(\d{3})/, "$1\u00a0$2\u00a0$3");
}

/**
 * Převede křestní jméno do 5. pádu (vokativ) podle českých pravidel.
 * Pokrývá nejběžnější vzory — není 100% přesné pro exotická jména.
 */
function vocative(name: string): string {
    // Ženská: končí na -a nebo -á → nahradit za -o
    if (/[aá]$/.test(name)) return name.slice(0, -1) + "o";
    // Ženská: končí na -e → beze změny (Marie, Sofie…)
    if (/e$/.test(name))    return name;
    // Mužská: měkké hlásky a -j → přidat -i (Tomáš→Tomáši, Ondřej→Ondřeji…)
    if (/[šžčřj]$/.test(name)) return name + "i";
    // Mužská: -k → přidat -u (Marek→Marku, Dominik→Dominiku…)
    if (/k$/.test(name))    return name + "u";
    // Mužská: ostatní → přidat -e (Petr→Petre, Jan→Jane, Pavel→Pavle…)
    return name + "e";
}

// ── Paylibo QR URL ────────────────────────────────────────────────────────────

function buildPayliboUrl(data: ContribEmailData): string | null {
    if (!data.variableSymbol || !data.amountTotal) return null;
    const [accountNumber, bankCode] = data.bankAccount.split("/");
    const message = encodeURIComponent(`Příspěvky OVT Bohemians ${data.year}`);
    const fullVS  = buildFullVS(data.variableSymbol);
    return (
        `https://api.paylibo.com/paylibo/generator/czech/image` +
        `?accountNumber=${accountNumber}` +
        `&bankCode=${bankCode}` +
        `&amount=${data.amountTotal}` +
        `&currency=CZK` +
        `&vs=${fullVS}` +
        `&message=${message}` +
        `&size=200`
    );
}

// ── Pomocná funkce pro řádek tabulky ─────────────────────────────────────────

function row(label: string, value: string, color?: string): string {
    return `
        <tr>
            <td style="padding:4px 8px 4px 0;color:#6b7280;font-size:14px;">${label}</td>
            <td style="padding:4px 0;font-size:14px;font-weight:600;color:${color ?? "#111827"};text-align:right;">${value}</td>
        </tr>`;
}

// ── Hlavní funkce ─────────────────────────────────────────────────────────────

export function buildContributionPrescriptionEmail(data: ContribEmailData): { subject: string; html: string } {
    const qrUrl = buildPayliboUrl(data);
    const [accountNumber, bankCode] = data.bankAccount.split("/");

    const breakdownRows: string[] = [];
    if (data.amountBase)   breakdownRows.push(row("Základní příspěvek", fmt(data.amountBase)));
    if (data.amountBoat1)  breakdownRows.push(row("1.\u00a0loď", fmt(data.amountBoat1)));
    if (data.amountBoat2)  breakdownRows.push(row("2.\u00a0loď", fmt(data.amountBoat2)));
    if (data.amountBoat3)  breakdownRows.push(row("3.\u00a0loď", fmt(data.amountBoat3)));
    if (data.brigadeSurcharge && data.brigadeSurcharge > 0)
        breakdownRows.push(row("Neodpracovaná brigáda", fmt(data.brigadeSurcharge), "#b45309"));
    if (data.discountCommittee && data.discountCommittee < 0)
        breakdownRows.push(row("Sleva — člen výboru", fmt(data.discountCommittee), "#15803d"));
    if (data.discountTom && data.discountTom < 0)
        breakdownRows.push(row("Sleva — vedoucí TOM", fmt(data.discountTom), "#15803d"));
    if (data.discountIndividual && data.discountIndividual < 0)
        breakdownRows.push(row("Individuální sleva", fmt(data.discountIndividual), "#15803d"));

    const subject = `Příspěvky OVT Bohemians ${data.year} — předpis`;
    const vsFormatted = data.variableSymbol ? fmtVS(data.variableSymbol) : null;

    const html = `<!DOCTYPE html>
<html lang="cs">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 16px;">
<tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;max-width:560px;width:100%;">

  <!-- Header -->
  <tr>
    <td style="background:#327600;padding:24px 32px;">
      <p style="margin:0;color:#ffffff;font-size:20px;font-weight:700;">OVT Bohemians</p>
      <p style="margin:4px 0 0;color:#a3d977;font-size:14px;">Příspěvky ${data.year}</p>
    </td>
  </tr>

  <!-- Body -->
  <tr>
    <td style="padding:28px 32px 8px;">
      <p style="margin:0 0 16px;font-size:15px;color:#374151;">Ahoj, <strong>${vocative(data.firstName)}</strong>,</p>
      <p style="margin:0 0 24px;font-size:14px;color:#6b7280;line-height:1.6;">
        zasíláme ti přehled členských příspěvků OVT Bohemians na rok <strong>${data.year}</strong>.
        Prosíme tě o uhrazení níže uvedené částky.
      </p>

      <!-- Rozpis příspěvků -->
      <table width="100%" cellpadding="0" cellspacing="0"
             style="border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin-bottom:24px;">
        <tr><td colspan="2" style="padding:0 0 12px;">
          <p style="margin:0;font-size:13px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.05em;">
            Rozpis příspěvků
          </p>
        </td></tr>
        ${breakdownRows.join("")}
        <tr><td colspan="2" style="padding:12px 0 0;border-top:1px solid #e5e7eb;"></td></tr>
        <tr>
          <td style="font-size:15px;font-weight:700;color:#111827;">Celkem k úhradě</td>
          <td style="font-size:18px;font-weight:700;color:#327600;text-align:right;">${fmt(data.amountTotal)}</td>
        </tr>
      </table>

      <!-- Platební údaje -->
      <table width="100%" cellpadding="0" cellspacing="0"
             style="border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin-bottom:24px;background:#f9fafb;">
        <tr><td colspan="2" style="padding:0 0 12px;">
          <p style="margin:0;font-size:13px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.05em;">
            Platební údaje
          </p>
        </td></tr>
        <tr>
          <td style="padding:4px 8px 4px 0;color:#6b7280;font-size:14px;">Číslo účtu</td>
          <td style="padding:4px 0;font-size:14px;font-weight:600;color:#111827;text-align:right;">${accountNumber}/${bankCode}</td>
        </tr>
        ${vsFormatted ? row("Variabilní symbol", vsFormatted) : ""}
        ${data.dueDate ? row("Datum splatnosti", `<strong>${fmtDate(data.dueDate)}</strong>`) : ""}
      </table>

      ${qrUrl ? `
      <!-- QR kód pro platbu -->
      <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
        <tr><td align="center">
          <p style="margin:0 0 4px;font-size:13px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.05em;">
            QR platba
          </p>
          <p style="margin:0 0 12px;font-size:12px;color:#9ca3af;line-height:1.5;">
            Naskenuj kód v mobilní aplikaci své banky.<br>
            Pokud obrázek nevidíš, povol zobrazení obrázků ve svém emailovém klientu
            nebo si kód zobraz přes
            <a href="${qrUrl}" style="color:#327600;">tento odkaz</a>.
          </p>
          <img src="${qrUrl}" width="200" height="200" alt="QR kód pro platbu"
               style="display:block;border:1px solid #e5e7eb;border-radius:8px;padding:8px;background:#fff;margin:0 auto;" />
        </td></tr>
      </table>
      ` : ""}

      <p style="margin:0 0 8px;font-size:13px;color:#9ca3af;line-height:1.6;">
        V případě dotazů odpověz na tento email, případně kontaktuj Tomáše Bauera.
      </p>
    </td>
  </tr>

  <!-- Footer -->
  <tr>
    <td style="padding:16px 32px 24px;border-top:1px solid #f3f4f6;">
      <p style="margin:0;font-size:12px;color:#9ca3af;">
        OVT Bohemians — vodní turistika Praha<br>
        Tento email byl odeslán ze systému správy OVT.
      </p>
    </td>
  </tr>

</table>
</td></tr>
</table>
</body>
</html>`;

    return { subject, html };
}
