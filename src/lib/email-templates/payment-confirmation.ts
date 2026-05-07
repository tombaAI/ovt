/**
 * HTML šablona potvrzení platby — zasílá se po napárování TJ transakce
 * na předpis příspěvků nebo předpis platby za akci.
 */

function fmt(n: number): string {
    return n.toLocaleString("cs-CZ") + " Kč";
}

function fmtDate(iso: string): string {
    const [y, m, d] = iso.split("-");
    return `${Number(d)}. ${Number(m)}. ${y}`;
}

import { vocative } from "./vocative";

// ── Potvrzení platby příspěvků ────────────────────────────────────────────────

export type ContribPaymentConfirmationData = {
    firstName:      string;
    lastName:       string;
    year:           number;
    amountPaid:     number;
    paidAt:         string;   // ISO date
    variableSymbol: number | null;
};

export function buildContribPaymentConfirmationEmail(
    data: ContribPaymentConfirmationData
): { subject: string; html: string } {
    const subject = `Potvrzení platby příspěvků OVT Bohemians ${data.year}`;

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
      <p style="margin:4px 0 0;color:#a3d977;font-size:14px;">Potvrzení platby příspěvků ${data.year}</p>
    </td>
  </tr>

  <!-- Ikona zaplaceno -->
  <tr>
    <td style="padding:28px 32px 0;text-align:center;">
      <div style="display:inline-block;background:#f0fdf4;border-radius:50%;width:64px;height:64px;line-height:64px;font-size:32px;text-align:center;">✅</div>
    </td>
  </tr>

  <!-- Body -->
  <tr>
    <td style="padding:20px 32px 8px;">
      <p style="margin:0 0 16px;font-size:15px;color:#374151;text-align:center;">
        Ahoj, <strong>${vocative(data.firstName)}</strong>,
      </p>
      <p style="margin:0 0 24px;font-size:14px;color:#6b7280;line-height:1.6;text-align:center;">
        tvoje platba členských příspěvků OVT Bohemians na rok <strong>${data.year}</strong> byla přijata a potvrzena. Díky!
      </p>

      <!-- Souhrn platby -->
      <table width="100%" cellpadding="0" cellspacing="0"
             style="border:1px solid #d1fae5;border-radius:8px;padding:16px;margin-bottom:24px;background:#f0fdf4;">
        <tr>
          <td style="padding:4px 8px 4px 0;color:#6b7280;font-size:14px;">Uhrazená částka</td>
          <td style="padding:4px 0;font-size:16px;font-weight:700;color:#15803d;text-align:right;">${fmt(data.amountPaid)}</td>
        </tr>
        <tr>
          <td style="padding:4px 8px 4px 0;color:#6b7280;font-size:14px;">Datum platby</td>
          <td style="padding:4px 0;font-size:14px;font-weight:600;color:#111827;text-align:right;">${fmtDate(data.paidAt)}</td>
        </tr>
        <tr>
          <td style="padding:4px 8px 4px 0;color:#6b7280;font-size:14px;">Příspěvky rok</td>
          <td style="padding:4px 0;font-size:14px;font-weight:600;color:#111827;text-align:right;">${data.year}</td>
        </tr>
        ${data.variableSymbol ? `
        <tr>
          <td style="padding:4px 8px 4px 0;color:#6b7280;font-size:14px;">Variabilní symbol</td>
          <td style="padding:4px 0;font-size:14px;font-weight:600;color:#111827;text-align:right;">${data.variableSymbol}</td>
        </tr>` : ""}
      </table>

      <p style="margin:0 0 8px;font-size:13px;color:#9ca3af;line-height:1.6;">
        V případě dotazů odpověz na tento email nebo kontaktuj Tomáše Bauera.
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

// ── Potvrzení platby zálohy / platby za akci ──────────────────────────────────

export type EventPaymentConfirmationData = {
    firstName:        string;
    lastName:         string;
    eventName:        string;
    amountPaid:       number;
    paidAt:           string;   // ISO date
    prescriptionCode: number;
};

export function buildEventPaymentConfirmationEmail(
    data: EventPaymentConfirmationData
): { subject: string; html: string } {
    const subject = `Potvrzení platby — ${data.eventName}`;

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
      <p style="margin:4px 0 0;color:#a3d977;font-size:14px;">Potvrzení platby za akci</p>
    </td>
  </tr>

  <!-- Ikona zaplaceno -->
  <tr>
    <td style="padding:28px 32px 0;text-align:center;">
      <div style="display:inline-block;background:#f0fdf4;border-radius:50%;width:64px;height:64px;line-height:64px;font-size:32px;text-align:center;">✅</div>
    </td>
  </tr>

  <!-- Body -->
  <tr>
    <td style="padding:20px 32px 8px;">
      <p style="margin:0 0 16px;font-size:15px;color:#374151;text-align:center;">
        Ahoj, <strong>${vocative(data.firstName)}</strong>,
      </p>
      <p style="margin:0 0 24px;font-size:14px;color:#6b7280;line-height:1.6;text-align:center;">
        tvoje platba za akci <strong>${data.eventName}</strong> byla přijata a potvrzena. Těšíme se na tebe!
      </p>

      <!-- Souhrn platby -->
      <table width="100%" cellpadding="0" cellspacing="0"
             style="border:1px solid #d1fae5;border-radius:8px;padding:16px;margin-bottom:24px;background:#f0fdf4;">
        <tr>
          <td style="padding:4px 8px 4px 0;color:#6b7280;font-size:14px;">Akce</td>
          <td style="padding:4px 0;font-size:14px;font-weight:600;color:#111827;text-align:right;">${data.eventName}</td>
        </tr>
        <tr>
          <td style="padding:4px 8px 4px 0;color:#6b7280;font-size:14px;">Uhrazená částka</td>
          <td style="padding:4px 0;font-size:16px;font-weight:700;color:#15803d;text-align:right;">${fmt(data.amountPaid)}</td>
        </tr>
        <tr>
          <td style="padding:4px 8px 4px 0;color:#6b7280;font-size:14px;">Datum platby</td>
          <td style="padding:4px 0;font-size:14px;font-weight:600;color:#111827;text-align:right;">${fmtDate(data.paidAt)}</td>
        </tr>
        <tr>
          <td style="padding:4px 8px 4px 0;color:#6b7280;font-size:14px;">Kód předpisu</td>
          <td style="padding:4px 0;font-size:14px;font-weight:600;color:#111827;text-align:right;">C${data.prescriptionCode}</td>
        </tr>
      </table>

      <p style="margin:0 0 8px;font-size:13px;color:#9ca3af;line-height:1.6;">
        V případě dotazů odpověz na tento email nebo kontaktuj Tomáše Bauera.
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
