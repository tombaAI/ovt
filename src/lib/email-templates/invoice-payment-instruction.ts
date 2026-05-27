export type InvoicePaymentInstructionData = {
    eventName: string;
    payeeName: string | null;
    amount: number | null;
    purposeText: string | null;
    fileName: string | null;
    senderName: string;
};

function tableRow(label: string, value: string): string {
    return `<tr>
      <td style="padding:6px 12px 6px 0;color:#6b7280;font-size:14px;white-space:nowrap;vertical-align:top;">${label}</td>
      <td style="padding:6px 0;font-size:14px;color:#111827;font-weight:500;text-align:right;">${value}</td>
    </tr>`;
}

export function buildInvoicePaymentInstructionEmail(
    data: InvoicePaymentInstructionData,
): { subject: string; html: string } {
    const payeeLabel = data.payeeName ?? "—";
    const subject = `Pokyn k úhradě faktury — ${payeeLabel} (${data.eventName})`;

    const rows = [
        data.payeeName ? tableRow("Příjemce", data.payeeName) : "",
        data.amount !== null ? tableRow("Částka", `${new Intl.NumberFormat("cs-CZ").format(data.amount)} Kč`) : "",
        data.purposeText ? tableRow("Popis", data.purposeText) : "",
        data.fileName ? tableRow("Příloha", data.fileName) : "",
        tableRow("Akce", data.eventName),
    ].filter(Boolean).join("\n");

    const html = `<!DOCTYPE html>
<html lang="cs">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:32px 16px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.08);">

        <!-- Hlavička -->
        <tr>
          <td style="background:#327600;padding:22px 28px;">
            <h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:700;line-height:1.2;">Pokyn k úhradě faktury</h1>
          </td>
        </tr>

        <!-- Tělo -->
        <tr>
          <td style="padding:28px 28px 8px;">
            <p style="margin:0 0 20px;font-size:15px;color:#111827;">Dobrý den,</p>
            <p style="margin:0 0 24px;font-size:15px;color:#111827;line-height:1.6;">
              prosím o proplacení faktury dle přílohy z účtu oddílu
              <strong style="color:#327600;">207 Oddíl Vodní Turistiky</strong>.
            </p>

            <!-- Detailní tabulka -->
            <table cellpadding="0" cellspacing="0" style="width:100%;border-top:1px solid #e5e7eb;border-bottom:1px solid #e5e7eb;margin-bottom:28px;">
              ${rows}
            </table>

            <!-- Podpis -->
            <p style="margin:0 0 4px;font-size:14px;color:#374151;line-height:1.7;">
              Děkuji.<br>
              Tomáš Bauer,<br>
              Hospodář OVT
            </p>
          </td>
        </tr>

        <!-- Patička -->
        <tr>
          <td style="padding:16px 28px;border-top:1px solid #f3f4f6;background:#f9fafb;">
            <p style="margin:0;font-size:12px;color:#9ca3af;">
              Odesláno: ${data.senderName}
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
