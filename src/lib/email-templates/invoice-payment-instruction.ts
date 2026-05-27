export type InvoicePaymentInstructionData = {
    eventName: string;
    amount: number | null;
    purposeText: string | null;
    fileName: string | null;
    senderName: string;
};

export function buildInvoicePaymentInstructionEmail(
    data: InvoicePaymentInstructionData,
): { subject: string; html: string } {
    const subject = `Pokyn k úhradě faktury — ${data.eventName}`;

    const amountRow = data.amount !== null
        ? `<tr>
            <td style="padding:4px 8px 4px 0;color:#6b7280;font-size:14px;">Částka</td>
            <td style="padding:4px 0;font-size:14px;font-weight:600;color:#111827;text-align:right;">
              ${new Intl.NumberFormat("cs-CZ").format(data.amount)} Kč
            </td>
          </tr>`
        : "";

    const purposeRow = data.purposeText
        ? `<tr>
            <td style="padding:4px 8px 4px 0;color:#6b7280;font-size:14px;">Popis</td>
            <td style="padding:4px 0;font-size:14px;color:#374151;text-align:right;">${data.purposeText}</td>
          </tr>`
        : "";

    const html = `<!DOCTYPE html>
<html lang="cs">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:32px 16px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.08);">

        <!-- Hlavička -->
        <tr>
          <td style="background:#327600;padding:20px 28px;">
            <p style="margin:0;color:#ffffff;font-size:13px;opacity:0.85;">OVT Bohemians — správa oddílu</p>
            <h1 style="margin:4px 0 0;color:#ffffff;font-size:20px;font-weight:700;">Pokyn k úhradě faktury</h1>
          </td>
        </tr>

        <!-- Tělo -->
        <tr>
          <td style="padding:28px 28px 20px;">
            <p style="margin:0 0 20px;font-size:15px;color:#111827;line-height:1.6;">
              Prosím o proplacení faktury dle přílohy z účtu oddílu
              <strong style="color:#327600;">207 Oddíl Vodní Turistiky</strong>.
            </p>

            <!-- Detaily -->
            <table cellpadding="0" cellspacing="0" style="width:100%;border-top:1px solid #f3f4f6;margin-bottom:24px;">
              <tr>
                <td style="padding:4px 8px 4px 0;color:#6b7280;font-size:14px;">Akce</td>
                <td style="padding:4px 0;font-size:14px;font-weight:600;color:#111827;text-align:right;">${data.eventName}</td>
              </tr>
              ${amountRow}
              ${purposeRow}
              ${data.fileName ? `<tr>
                <td style="padding:4px 8px 4px 0;color:#6b7280;font-size:14px;">Příloha</td>
                <td style="padding:4px 0;font-size:14px;color:#374151;text-align:right;">${data.fileName}</td>
              </tr>` : ""}
            </table>

            <p style="margin:0;font-size:13px;color:#6b7280;">
              Faktura je přiložena k tomuto e-mailu. Pokud máte dotazy, odpovězte na tento e-mail.
            </p>
          </td>
        </tr>

        <!-- Patička -->
        <tr>
          <td style="padding:16px 28px;border-top:1px solid #f3f4f6;background:#f9fafb;">
            <p style="margin:0;font-size:12px;color:#9ca3af;">
              Odesláno systémem OVT Bohemians — správa oddílu · ${data.senderName}
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
