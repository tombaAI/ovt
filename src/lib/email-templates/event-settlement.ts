/**
 * HTML šablona e-mailu s předpisem platby za akci OVT Bohemians.
 * Zasílá se po vygenerování předpisů vyúčtování akce.
 */

function fmt(n: number): string {
    return n.toLocaleString("cs-CZ") + " Kč";
}

function fmtDate(iso: string): string {
    const [y, m, d] = iso.split("-");
    return `${Number(d)}. ${Number(m)}. ${y}`;
}

function vocative(name: string): string {
    if (/něk$/.test(name))      return name.replace(/něk$/, "ňku");
    if (/ch$/.test(name))       return name + "u";
    if (/[aá]$/.test(name))     return name.slice(0, -1) + "o";
    if (/[eí]$/.test(name))     return name;
    if (/o$/.test(name))        return name;
    if (/[šžčřj]$/.test(name))  return name + "i";
    if (/k$/.test(name))        return name + "u";
    return name + "e";
}

function buildPayliboUrl(amount: number, prescriptionCode: number, variableSymbol: string, bankAccount: string, eventName: string): string {
    const [accountNumber, bankCode] = bankAccount.split("/");
    const message = encodeURIComponent(`C${prescriptionCode} ${eventName}`);
    return (
        `https://api.paylibo.com/paylibo/generator/czech/image` +
        `?accountNumber=${accountNumber}` +
        `&bankCode=${bankCode}` +
        `&amount=${amount}` +
        `&currency=CZK` +
        `&vs=${variableSymbol}` +
        `&message=${message}` +
        `&size=200`
    );
}

function tableRow(label: string, value: string, color?: string): string {
    return `
        <tr>
          <td style="padding:4px 8px 4px 0;color:#6b7280;font-size:14px;">${label}</td>
          <td style="padding:4px 0;font-size:14px;font-weight:600;color:${color ?? "#111827"};text-align:right;">${value}</td>
        </tr>`;
}

export type EventSettlementEmailData = {
    firstName:        string;
    lastName:         string;
    email:            string;
    eventName:        string;
    prescriptionCode: number;
    variableSymbol:   string;
    amount:           number;
    bankAccount:      string;
    paymentDue:       string | null;  // ISO date
    expenses: {
        purposeText: string | null;
        allocatedAmount: number;
    }[];
    subsidy:          number;
};

export function buildEventSettlementEmail(
    data: EventSettlementEmailData,
): { subject: string; html: string } {
    const subject = `Předpis platby — ${data.eventName}`;
    const qrUrl = buildPayliboUrl(data.amount, data.prescriptionCode, data.variableSymbol, data.bankAccount, data.eventName);
    const [accountNumber, bankCode] = data.bankAccount.split("/");

    const expenseRows = data.expenses
        .filter(e => e.allocatedAmount > 0)
        .map(e => tableRow(e.purposeText ?? "Náklad", fmt(e.allocatedAmount)));

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
      <p style="margin:4px 0 0;color:#a3d977;font-size:14px;">Předpis platby za akci</p>
    </td>
  </tr>

  <!-- Body -->
  <tr>
    <td style="padding:28px 32px 8px;">
      <p style="margin:0 0 16px;font-size:15px;color:#374151;">Ahoj, <strong>${vocative(data.firstName)}</strong>,</p>
      <p style="margin:0 0 24px;font-size:14px;color:#6b7280;line-height:1.6;">
        zasíláme ti předpis platby za akci <strong>${data.eventName}</strong>.
        Prosíme tě o uhrazení níže uvedené částky.
      </p>

      <!-- Rozpis nákladů -->
      ${expenseRows.length > 0 ? `
      <table width="100%" cellpadding="0" cellspacing="0"
             style="border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin-bottom:16px;">
        <tr><td colspan="2" style="padding:0 0 12px;">
          <p style="margin:0;font-size:13px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.05em;">
            Rozpis nákladů
          </p>
        </td></tr>
        ${expenseRows.join("")}
        ${data.subsidy > 0 ? tableRow("Dotace OVT Bohemians", "−" + fmt(data.subsidy), "#15803d") : ""}
        <tr><td colspan="2" style="padding:12px 0 0;border-top:1px solid #e5e7eb;"></td></tr>
        <tr>
          <td style="font-size:15px;font-weight:700;color:#111827;">Celkem k úhradě</td>
          <td style="font-size:18px;font-weight:700;color:#327600;text-align:right;">${fmt(data.amount)}</td>
        </tr>
      </table>` : `
      <table width="100%" cellpadding="0" cellspacing="0"
             style="border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin-bottom:16px;">
        <tr>
          <td style="font-size:15px;font-weight:700;color:#111827;">Celkem k úhradě</td>
          <td style="font-size:18px;font-weight:700;color:#327600;text-align:right;">${fmt(data.amount)}</td>
        </tr>
      </table>`}

      <!-- Platební údaje -->
      <table width="100%" cellpadding="0" cellspacing="0"
             style="border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin-bottom:24px;background:#f9fafb;">
        <tr><td colspan="2" style="padding:0 0 12px;">
          <p style="margin:0;font-size:13px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.05em;">
            Platební údaje
          </p>
        </td></tr>
        ${tableRow("Číslo účtu", `${accountNumber}/${bankCode}`)}
        ${tableRow("Variabilní symbol", data.variableSymbol)}
        ${tableRow("Zpráva pro příjemce", `C${data.prescriptionCode} ${data.firstName} ${data.lastName}`)}
        ${data.paymentDue ? tableRow("Splatnost", fmtDate(data.paymentDue), "#b45309") : ""}
      </table>

      <!-- QR kód -->
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
