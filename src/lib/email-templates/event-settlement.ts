/**
 * HTML šablona e-mailu s předpisem platby za akci OVT Bohemians.
 * Zasílá se po vygenerování předpisů vyúčtování akce.
 */

import { vocative } from "./vocative";

function fmt(n: number): string {
    return n.toLocaleString("cs-CZ") + " Kč";
}

function fmtDate(iso: string): string {
    const [y, m, d] = iso.split("-");
    return `${Number(d)}. ${Number(m)}. ${y}`;
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
    paymentDue:       string | null;
    unitPrice:        number;
    participants:     { fullName: string; isMember: boolean }[];
    memberCount:      number;
    subsidy:          number;
};

export function buildEventSettlementEmail(
    data: EventSettlementEmailData,
): { subject: string; html: string } {
    const subject = `Předpis platby — ${data.eventName}`;
    const qrUrl = buildPayliboUrl(data.amount, data.prescriptionCode, data.variableSymbol, data.bankAccount, data.eventName);
    const [accountNumber, bankCode] = data.bankAccount.split("/");

    // Řádky účastníků
    const participantRows = data.participants.map(p => `
        <tr style="border-bottom:1px solid #f3f4f6;">
          <td style="padding:6px 8px 6px 0;font-size:13px;color:#111827;">${p.fullName}</td>
          <td style="padding:6px 8px;font-size:12px;text-align:center;">
            ${p.isMember
                ? `<span style="background:#dcfce7;color:#15803d;padding:2px 8px;border-radius:99px;font-size:11px;font-weight:600;">Člen OVT</span>`
                : `<span style="color:#9ca3af;font-size:12px;">—</span>`}
          </td>
          <td style="padding:6px 0;font-size:13px;text-align:right;color:#374151;white-space:nowrap;">${fmt(data.unitPrice)}</td>
        </tr>`).join("");

    const subsidyRow = data.subsidy > 0 ? `
        <tr>
          <td colspan="2" style="padding:8px 8px 8px 0;font-size:13px;color:#15803d;">
            Dotace OVT Bohemians${data.memberCount > 1 ? ` (${data.memberCount} členové)` : ""}
          </td>
          <td style="padding:8px 0;font-size:13px;font-weight:600;text-align:right;color:#15803d;white-space:nowrap;">−${fmt(data.subsidy)}</td>
        </tr>` : "";

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

      <!-- Přihlášení účastníci -->
      <table width="100%" cellpadding="0" cellspacing="0"
             style="border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin-bottom:16px;">
        <tr><td colspan="3" style="padding:0 0 10px;">
          <p style="margin:0;font-size:13px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.05em;">
            Přihlášení účastníci
          </p>
        </td></tr>
        <tr style="border-bottom:1px solid #e5e7eb;">
          <th style="padding:4px 8px 8px 0;text-align:left;font-size:11px;color:#9ca3af;font-weight:normal;">Jméno</th>
          <th style="padding:4px 8px 8px;text-align:center;font-size:11px;color:#9ca3af;font-weight:normal;">Členství</th>
          <th style="padding:4px 0 8px;text-align:right;font-size:11px;color:#9ca3af;font-weight:normal;">Cena/os.</th>
        </tr>
        ${participantRows}
        ${subsidyRow}
        <tr><td colspan="3" style="padding:10px 0 0;border-top:2px solid #e5e7eb;"></td></tr>
        <tr>
          <td colspan="2" style="font-size:15px;font-weight:700;color:#111827;">Celkem k úhradě</td>
          <td style="font-size:18px;font-weight:700;color:#327600;text-align:right;white-space:nowrap;">${fmt(data.amount)}</td>
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
            Pokud obrázek nevidíš, zobraz si kód přes
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
