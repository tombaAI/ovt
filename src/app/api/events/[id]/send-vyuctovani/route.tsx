import { renderToBuffer } from "@react-pdf/renderer";
import { asc, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { eventExpenses, events, members, people } from "@/db/schema";
import { getDb } from "@/lib/db";
import { getEmailSettings, getResendClient } from "@/lib/email";
import {
  VyuctovaniDocument,
  type VyuctovaniData,
  type VyuctovaniNaklady,
} from "@/lib/pdf/vyuctovani-template";

export const dynamic = "force-dynamic";

const DEFAULT_ODDIL = "207 Oddíl vodní turistiky";
const DEFAULT_SCHVALIL = "Tomáš Bauer";

type EmailAttachment = {
  filename: string;
  content: Buffer;
};

function eventPdfName(baseName: string, eventName: string): string {
  const slug = eventName
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 56) || "akce";

  return `${baseName}-${slug}.pdf`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function csvCell(value: string | number | null): string {
  const raw = value === null ? "" : String(value);
  return `"${raw.replace(/"/g, '""')}"`;
}

function formatAmount(amount: number): string {
  return new Intl.NumberFormat("cs-CZ", { maximumFractionDigits: 2 }).format(amount);
}

async function fetchPrivateBlobAttachment(url: string, filename: string): Promise<EmailAttachment> {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) {
    throw new Error("BLOB_READ_WRITE_TOKEN není nastavený, nelze přiložit doklady z úložiště.");
  }

  if (!url.match(/^https:\/\/[^/]+\.blob\.vercel-storage\.com\//)) {
    throw new Error(`Neplatná URL dokladu: ${url}`);
  }

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    throw new Error(`Doklad ${filename} se nepodařilo načíst z úložiště.`);
  }

  return {
    filename,
    content: Buffer.from(await response.arrayBuffer()),
  };
}

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Nepřihlášen" }, { status: 401 });
    }

    const settings = getEmailSettings();
    if (!settings.configured) {
      return NextResponse.json(
        { error: "RESEND_API_KEY není nastavený. Vyúčtování nejde odeslat e-mailem." },
        { status: 503 },
      );
    }

    const { id } = await params;
    const eventId = Number(id);
    if (Number.isNaN(eventId) || eventId <= 0) {
      return NextResponse.json({ error: "Neplatné ID akce" }, { status: 400 });
    }

    const db = getDb();
    const [event] = await db
      .select({
        id: events.id,
        name: events.name,
        leaderName: members.fullName,
        leaderEmail: members.email,
      })
      .from(events)
      .leftJoin(members, eq(events.leaderId, members.id))
      .where(eq(events.id, eventId))
      .limit(1);

    if (!event) {
      return NextResponse.json({ error: "Akce nenalezena" }, { status: 404 });
    }

    const hospodarEmail = process.env.EMAIL_HOSPODAR_ODDILU_TJB?.trim() || null;
    const recipients = [event.leaderEmail, hospodarEmail].filter((e): e is string => !!e);
    if (recipients.length === 0) {
      return NextResponse.json(
        { error: "Vedoucí akce nemá e-mail a ENV EMAIL_HOSPODAR_ODDILU_TJB není nastavený. Nelze odeslat." },
        { status: 503 },
      );
    }

    const allExpenses = await db
      .select({
        id: eventExpenses.id,
        status: eventExpenses.status,
        amount: eventExpenses.amount,
        purposeText: eventExpenses.purposeText,
        purposeCategory: eventExpenses.purposeCategory,
        reimbursementPersonId: eventExpenses.reimbursementPersonId,
        reimbursementMemberId: eventExpenses.reimbursementMemberId,
        reimbursementPayeeName: people.fullName,
        reimbursementPayeeMemberId: people.memberId,
        bankAccountNumber: people.bankAccountNumber,
        bankCode: people.bankCode,
        fileUrl: eventExpenses.fileUrl,
        fileName: eventExpenses.fileName,
      })
      .from(eventExpenses)
      .leftJoin(people, eq(eventExpenses.reimbursementPersonId, people.id))
      .where(eq(eventExpenses.eventId, eventId))
      .orderBy(asc(eventExpenses.createdAt));

    if (allExpenses.length === 0) {
      return NextResponse.json({ error: "Akce nemá žádné náklady k vyúčtování." }, { status: 400 });
    }

    // Hard block: unconfirmed or draft expenses
    const unconfirmedExpenses = allExpenses.filter((e) => e.status !== "final");
    if (unconfirmedExpenses.length > 0) {
      return NextResponse.json({
        error: `Nelze odeslat — ${unconfirmedExpenses.length} doklad${unconfirmedExpenses.length === 1 ? "" : "ů"} není potvrzeno.`,
        unconfirmedExpenses: unconfirmedExpenses.map((e) => ({ id: e.id, purposeText: e.purposeText })),
      }, { status: 400 });
    }

    const expenses = allExpenses; // all final at this point

    // Hard block: missing required fields on final expenses
    const missingRequiredFields = expenses.filter(
      (e) => !e.amount || Number(e.amount) <= 0 || !e.purposeText || !e.reimbursementPersonId,
    );
    if (missingRequiredFields.length > 0) {
      return NextResponse.json({
        error: `Nelze odeslat — ${missingRequiredFields.length} doklad${missingRequiredFields.length === 1 ? "" : "ů"} má nevyplněná povinná pole (částka, účel nebo příjemce).`,
        missingRequiredFields: missingRequiredFields.map((e) => ({ id: e.id, purposeText: e.purposeText })),
      }, { status: 400 });
    }

    // Hard block: missing bank accounts
    const missingBankAccounts = new Map<number, { id: number; name: string }>();
    for (const expense of expenses) {
      if (!expense.reimbursementPersonId || !expense.reimbursementPayeeName) continue;
      if (!expense.bankAccountNumber || !expense.bankCode) {
        missingBankAccounts.set(expense.reimbursementPersonId, {
          id: expense.reimbursementPersonId,
          name: expense.reimbursementPayeeName,
        });
      }
    }
    if (missingBankAccounts.size > 0) {
      return NextResponse.json({
        error: `Nelze odeslat — ${missingBankAccounts.size} příjemce${missingBankAccounts.size === 1 ? "" : "ů"} nemá vyplněný bankovní účet.`,
        missingBankAccounts: [...missingBankAccounts.values()],
      }, { status: 400 });
    }

    // All blocking conditions passed — no warnings needed (payees + bank accounts guaranteed above)
    const missingExpensePayees: Array<{ id: number; purposeText: string | null }> = [];

    const naklady: VyuctovaniNaklady = {};
    for (const expense of expenses) {
      const category = expense.purposeCategory as keyof VyuctovaniNaklady;
      naklady[category] = (naklady[category] ?? 0) + Number(expense.amount);
    }

    const settlementData: VyuctovaniData = {
      oddi: DEFAULT_ODDIL,
      cisloZalohy: "",
      zaMesicLabel: "za akci",
      zaMesic: event.name,
      veVysi: 0,
      naklady,
      prijmy: {},
      vyuctoval: event.leaderName ?? "",
      schvalil: DEFAULT_SCHVALIL,
      datum: new Intl.DateTimeFormat("cs-CZ").format(new Date()),
    };

    const settlementBuffer = Buffer.from(await renderToBuffer(<VyuctovaniDocument data={settlementData} />));
    const payoutRows = expenses.map((expense) => {
      const amount = Number(expense.amount);
      return {
        personId: expense.reimbursementPersonId,
        payeeName: expense.reimbursementPayeeName ?? "Nedoplněno",
        bankAccountNumber: expense.bankAccountNumber ?? "",
        bankCode: expense.bankCode ?? "",
        amount,
        purposeText: expense.purposeText,
        purposeCategory: expense.purposeCategory,
        fileName: expense.fileName ?? "",
      };
    });

    const csv = "\ufeff" + [
      ["Příjemce", "Číslo účtu", "Kód banky", "Částka Kč", "Účel", "Účetní kód", "Doklad"],
      ...payoutRows.map((row) => [
        row.payeeName,
        row.bankAccountNumber,
        row.bankCode,
        row.amount,
        row.purposeText,
        row.purposeCategory,
        row.fileName,
      ]),
    ].map((row) => row.map(csvCell).join(";")).join("\n");

    const attachmentPromises = expenses
      .filter((expense) => expense.fileUrl)
      .map((expense) => fetchPrivateBlobAttachment(
        expense.fileUrl!,
        expense.fileName ?? `doklad-${expense.id}`,
      ));

    const documentAttachments = await Promise.all(attachmentPromises);
    const attachments: EmailAttachment[] = [
      {
        filename: eventPdfName("vyuctovani-oddilu", event.name),
        content: settlementBuffer,
      },
      {
        filename: "komu-co-odeslat.csv",
        content: Buffer.from(csv, "utf-8"),
      },
      ...documentAttachments,
    ];

    const total = payoutRows.reduce((sum, row) => sum + row.amount, 0);
    const warningItems = [
      ...missingExpensePayees.map((item) => `Náklad bez příjemce: ${item.purposeText}`),
      ...[...missingBankAccounts.values()].map((item) => `Příjemce bez účtu: ${item.name}`),
    ];
    const warningHtml = warningItems.length > 0
      ? `
      <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;border:1px solid #fcd34d;border-radius:8px;background:#fffbeb;">
        <tr>
          <td style="padding:12px 14px;color:#92400e;font-size:13px;line-height:1.55;">
            <p style="margin:0 0 6px;font-weight:700;">Upozornění</p>
            <ul style="margin:0 0 0 18px;padding:0;">
              ${warningItems.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
            </ul>
          </td>
        </tr>
      </table>`
      : "";
    const payoutTableRows = payoutRows.map((row, index) => `
      <tr>
        <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb;background:${index % 2 === 0 ? "#ffffff" : "#f9fafb"};">${escapeHtml(row.payeeName)}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb;background:${index % 2 === 0 ? "#ffffff" : "#f9fafb"};font-family:monospace">${row.bankAccountNumber || row.bankCode ? `${escapeHtml(row.bankAccountNumber)}/${escapeHtml(row.bankCode)}` : "Nedoplněno"}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb;background:${index % 2 === 0 ? "#ffffff" : "#f9fafb"};text-align:right;white-space:nowrap">${formatAmount(row.amount)} Kč</td>
        <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb;background:${index % 2 === 0 ? "#ffffff" : "#f9fafb"};">${escapeHtml(row.purposeText ?? "")}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb;background:${index % 2 === 0 ? "#ffffff" : "#f9fafb"};font-family:monospace">${escapeHtml(row.purposeCategory ?? "")}</td>
      </tr>
    `).join("");

    const senderDisplay = session.user.name?.trim()
      ? `${session.user.name.trim()} (${session.user.email})`
      : session.user.email;

    const html = `<!DOCTYPE html>
<html lang="cs">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 16px;">
<tr><td align="center">
<table width="760" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;max-width:760px;width:100%;">

  <tr>
    <td style="background:#327600;padding:24px 32px;">
      <p style="margin:0;color:#ffffff;font-size:20px;font-weight:700;">Oddíl Vodní Turistiky TJ Bohemians</p>
      <p style="margin:4px 0 0;color:#a3d977;font-size:14px;">Vyúčtování akce</p>
    </td>
  </tr>

  <tr>
    <td style="padding:28px 32px 10px;">
      <p style="margin:0 0 16px;font-size:15px;color:#374151;">Dobrý den,</p>
      <p style="margin:0 0 20px;font-size:14px;color:#6b7280;line-height:1.6;">
        v příloze zasíláme vyúčtování akce <strong>${escapeHtml(event.name)}</strong>,
        všechny uložené doklady nákladů a CSV tabulku s přehledem plateb k proplacení.
      </p>

      <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;border:1px solid #e5e7eb;border-radius:8px;background:#f9fafb;">
        <tr>
          <td style="padding:14px 16px;font-size:13px;color:#374151;line-height:1.55;">
            <p style="margin:0 0 6px;font-weight:700;color:#111827;text-transform:uppercase;letter-spacing:.04em;font-size:12px;">Přehled zásilky</p>
            <p style="margin:0;">Akce: <strong>${escapeHtml(event.name)}</strong></p>
            <p style="margin:2px 0 0;">Počet příloh: <strong>${attachments.length}</strong></p>
          </td>
        </tr>
      </table>

      ${warningHtml}

      <p style="margin:0 0 20px;font-size:14px;color:#6b7280;line-height:1.6;">
        Poprosím o proplacení následujících nákladů z podúčtu oddílu 207 (oddíl vodní turistiky):
      </p>

      <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;margin:0 0 16px;">
        <thead>
          <tr style="background:#f3f4f6;">
            <th style="padding:8px 10px;text-align:left;font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:.04em;">Příjemce</th>
            <th style="padding:8px 10px;text-align:left;font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:.04em;">Účet</th>
            <th style="padding:8px 10px;text-align:right;font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:.04em;">Částka</th>
            <th style="padding:8px 10px;text-align:left;font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:.04em;">Účel</th>
            <th style="padding:8px 10px;text-align:left;font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:.04em;">Kód</th>
          </tr>
        </thead>
        <tbody>${payoutTableRows}</tbody>
        <tfoot>
          <tr style="background:#f9fafb;">
            <td colspan="2" style="padding:10px;font-weight:700;text-align:right;color:#111827;">Celkem</td>
            <td style="padding:10px;font-weight:700;text-align:right;white-space:nowrap;color:#327600;">${formatAmount(total)} Kč</td>
            <td colspan="2"></td>
          </tr>
        </tfoot>
      </table>

      <p style="margin:0 0 8px;font-size:14px;color:#374151;line-height:1.6;">Děkuji,<br/>hezký den,<br/>Tomáš Bauer<br/>Hospodář oddílu OVT</p>
    </td>
  </tr>

  <tr>
    <td style="padding:16px 32px 24px;border-top:1px solid #f3f4f6;">
      <p style="margin:0;font-size:12px;color:#9ca3af;line-height:1.5;">
        Oddíl Vodní Turistiky TJ Bohemians Praha<br>
        Tento email byl odeslán ze systému správa OVT uživatelem ${escapeHtml(senderDisplay)}..
      </p>
    </td>
  </tr>

</table>
</td></tr>
</table>
</body>
</html>`;

    const textRows = payoutRows.map((row) => (
      `${row.payeeName}; ${row.bankAccountNumber || row.bankCode ? `${row.bankAccountNumber}/${row.bankCode}` : "Nedoplněno"}; ${formatAmount(row.amount)} Kč; ${row.purposeText}; ${row.purposeCategory}`
    )).join("\n");
    const warningText = warningItems.length > 0 ? `\n\nUpozornění:\n${warningItems.map((item) => `- ${item}`).join("\n")}` : "";

    const resend = getResendClient();
    const { data, error } = await resend.emails.send({
      from: settings.from,
      to: recipients,
      subject: `OVT vyúčtování akce: ${event.name}`,
      html,
      text: `Vyúčtování akce: ${event.name}${warningText}\n\nKomu co odeslat:\n${textRows}\n\nCelkem: ${formatAmount(total)} Kč`,
      replyTo: settings.replyTo,
      attachments,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 502 });
    }

    return NextResponse.json({
      success: true,
      emailId: data?.id ?? null,
      recipients,
      attachmentCount: attachments.length,
      warnings: warningItems,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Interní chyba";
    console.error("[POST /api/events/[id]/send-vyuctovani]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
