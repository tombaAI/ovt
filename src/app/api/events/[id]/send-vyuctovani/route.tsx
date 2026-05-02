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
const SETTLEMENT_RECIPIENT = "tomas.bauer@centrum.cz";

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
      })
      .from(events)
      .leftJoin(members, eq(events.leaderId, members.id))
      .where(eq(events.id, eventId))
      .limit(1);

    if (!event) {
      return NextResponse.json({ error: "Akce nenalezena" }, { status: 404 });
    }

    const expenses = await db
      .select({
        id: eventExpenses.id,
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

    if (expenses.length === 0) {
      return NextResponse.json({ error: "Akce nemá žádné náklady k vyúčtování." }, { status: 400 });
    }

    const missingExpensePayees = expenses
      .filter((expense) => !expense.reimbursementPersonId || !expense.reimbursementPayeeName)
      .map((expense) => ({ id: expense.id, purposeText: expense.purposeText }));

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
      ? `<div style="margin:12px 0;padding:10px 12px;background:#fffbeb;border:1px solid #fcd34d;color:#92400e;font-size:13px"><strong>Upozornění:</strong><ul style="margin:6px 0 0 18px;padding:0">${warningItems.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></div>`
      : "";
    const payoutTableRows = payoutRows.map((row) => `
      <tr>
        <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb">${escapeHtml(row.payeeName)}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;font-family:monospace">${row.bankAccountNumber || row.bankCode ? `${escapeHtml(row.bankAccountNumber)}/${escapeHtml(row.bankCode)}` : "Nedoplněno"}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;text-align:right;white-space:nowrap">${formatAmount(row.amount)} Kč</td>
        <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb">${escapeHtml(row.purposeText ?? "")}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;font-family:monospace">${escapeHtml(row.purposeCategory ?? "")}</td>
      </tr>
    `).join("");

    const html = `
      <div style="font-family:Segoe UI, Arial, sans-serif; line-height:1.5; color:#111827">
        <p>Dobrý den,</p>
        <p>v příloze posílám vyúčtování akce <strong>${escapeHtml(event.name)}</strong>, všechny uložené doklady nákladů a CSV tabulku komu co odeslat za peníze.</p>
        ${warningHtml}
        <table style="border-collapse:collapse; width:100%; max-width:900px; font-size:13px">
          <thead>
            <tr style="background:#f3f4f6">
              <th style="padding:6px 8px;text-align:left">Člen</th>
              <th style="padding:6px 8px;text-align:left">Účet</th>
              <th style="padding:6px 8px;text-align:right">Částka</th>
              <th style="padding:6px 8px;text-align:left">Účel</th>
              <th style="padding:6px 8px;text-align:left">Kód</th>
            </tr>
          </thead>
          <tbody>${payoutTableRows}</tbody>
          <tfoot>
            <tr>
              <td colspan="2" style="padding:8px;font-weight:600;text-align:right">Celkem</td>
              <td style="padding:8px;font-weight:600;text-align:right;white-space:nowrap">${formatAmount(total)} Kč</td>
              <td colspan="2"></td>
            </tr>
          </tfoot>
        </table>
        <p style="color:#6b7280;font-size:12px;margin-top:16px">Odesláno z OVT správy uživatelem ${escapeHtml(session.user.email)}.</p>
      </div>
    `;

    const textRows = payoutRows.map((row) => (
      `${row.payeeName}; ${row.bankAccountNumber || row.bankCode ? `${row.bankAccountNumber}/${row.bankCode}` : "Nedoplněno"}; ${formatAmount(row.amount)} Kč; ${row.purposeText}; ${row.purposeCategory}`
    )).join("\n");
    const warningText = warningItems.length > 0 ? `\n\nUpozornění:\n${warningItems.map((item) => `- ${item}`).join("\n")}` : "";

    const resend = getResendClient();
    const { data, error } = await resend.emails.send({
      from: settings.from,
      to: [SETTLEMENT_RECIPIENT],
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
      recipient: SETTLEMENT_RECIPIENT,
      attachmentCount: attachments.length,
      warnings: warningItems,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Interní chyba";
    console.error("[POST /api/events/[id]/send-vyuctovani]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
