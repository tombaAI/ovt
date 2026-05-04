import { renderToBuffer } from "@react-pdf/renderer";
import { asc, eq } from "drizzle-orm";
import * as iconv from "iconv-lite";
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
    .replace(/[̀-ͯ]/g, "")
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

type PohodaPayment = {
  id: string;
  payeeName: string;
  bankAccountNumber: string;
  bankCode: string;
  amount: number;
  text: string;
  note: string;
  datePayment: string;
};

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function generatePohodaXml(
  payments: PohodaPayment[],
  eventName: string,
  ico: string,
): Buffer {
  const itemsXml = payments.map((p) => `
  <dat:dataPackItem version="2.0" id="${xmlEscape(p.id)}">
    <bnk:bank version="2.0">
      <bnk:bankHeader>
        <bnk:bankType>expense</bnk:bankType>
        <bnk:datePayment>${p.datePayment}</bnk:datePayment>
        <bnk:text>${xmlEscape(p.text.slice(0, 96))}</bnk:text>
        <bnk:partnerIdentity>
          <typ:address>
            <typ:name>${xmlEscape(p.payeeName)}</typ:name>
          </typ:address>
        </bnk:partnerIdentity>
        <bnk:paymentAccount>
          <typ:accountNo>${xmlEscape(p.bankAccountNumber)}</typ:accountNo>
          <typ:bankCode>${xmlEscape(p.bankCode)}</typ:bankCode>
        </bnk:paymentAccount>
        <bnk:note>${xmlEscape(p.note)}</bnk:note>
      </bnk:bankHeader>
      <bnk:bankSummary>
        <bnk:homeCurrency>
          <typ:priceNone>${p.amount.toFixed(2)}</typ:priceNone>
        </bnk:homeCurrency>
      </bnk:bankSummary>
    </bnk:bank>
  </dat:dataPackItem>`).join("");

  const xml = `<?xml version="1.0" encoding="Windows-1250"?>
<dat:dataPack
    xmlns:dat="http://www.stormware.cz/schema/version_2/data.xsd"
    xmlns:bnk="http://www.stormware.cz/schema/version_2/bank.xsd"
    xmlns:typ="http://www.stormware.cz/schema/version_2/type.xsd"
    version="2.0"
    id="ovt-vydaje-${Date.now()}"
    ico="${xmlEscape(ico)}"
    application="OVT Bohemians"
    note="${xmlEscape(`Proplacení výdajů z akce: ${eventName}`)}">${itemsXml}
</dat:dataPack>`;

  // POHODA requires Windows-1250 encoding
  return iconv.encode(xml, "win1250");
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

    const expenses = allExpenses;

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

    // Group expenses by beneficiary
    type PayeeGroup = {
      personId: number | null;
      payeeName: string;
      bankAccountNumber: string;
      bankCode: string;
      paymentMessage: string;
      items: Array<{ amount: number; purposeText: string; purposeCategory: string; fileName: string }>;
      total: number;
    };
    const groupMap = new Map<string, PayeeGroup>();
    for (const expense of expenses) {
      const key = String(expense.reimbursementPersonId ?? "__none__");
      if (!groupMap.has(key)) {
        groupMap.set(key, {
          personId: expense.reimbursementPersonId,
          payeeName: expense.reimbursementPayeeName ?? "Nedoplněno",
          bankAccountNumber: expense.bankAccountNumber ?? "",
          bankCode: expense.bankCode ?? "",
          paymentMessage: `proplacení nákladů z akce OVT: ${event.name}`,
          items: [],
          total: 0,
        });
      }
      const g = groupMap.get(key)!;
      const amount = Number(expense.amount);
      g.items.push({
        amount,
        purposeText: expense.purposeText ?? "",
        purposeCategory: expense.purposeCategory ?? "",
        fileName: expense.fileName ?? "",
      });
      g.total += amount;
    }
    const payeeGroups = [...groupMap.values()];
    const total = payeeGroups.reduce((s, g) => s + g.total, 0);

    // CSV — one summary row per beneficiary (for bank transfers)
    const csvBom = "﻿";
    const csvRows = [
      ["Příjemce", "Číslo účtu", "Kód banky", "Částka Kč", "Zpráva pro příjemce", "Počet dokladů"],
      ...payeeGroups.map((g) => [
        g.payeeName,
        g.bankAccountNumber,
        g.bankCode,
        g.total,
        g.paymentMessage,
        g.items.length,
      ]),
    ];
    const csv = csvBom + csvRows.map((row) => row.map(csvCell).join(";")).join("\n");

    const attachmentPromises = expenses
      .filter((expense) => expense.fileUrl)
      .map((expense) => fetchPrivateBlobAttachment(
        expense.fileUrl!,
        expense.fileName ?? `doklad-${expense.id}`,
      ));

    const documentAttachments = await Promise.all(attachmentPromises);

    const ico = process.env.ICO_TJ_BOHEMIANS ?? "";
    const datePayment = new Date().toISOString().slice(0, 10);
    const pohodaPayments: PohodaPayment[] = payeeGroups.map((g, i) => ({
      id: `vydaj-${i + 1}`,
      payeeName: g.payeeName,
      bankAccountNumber: g.bankAccountNumber,
      bankCode: g.bankCode,
      amount: g.total,
      text: `Propl. vyd. - ${g.payeeName} - ${event.name}`.slice(0, 96),
      note: g.paymentMessage,
      datePayment,
    }));
    const pohodaXml = generatePohodaXml(pohodaPayments, event.name, ico);

    const attachments: EmailAttachment[] = [
      {
        filename: eventPdfName("vyuctovani-oddilu", event.name),
        content: settlementBuffer,
      },
      {
        filename: "komu-co-odeslat.csv",
        content: Buffer.from(csv, "utf-8"),
      },
      {
        filename: eventPdfName("pohoda-import", event.name).replace(".pdf", ".xml"),
        content: pohodaXml,
      },
      ...documentAttachments,
    ];

    // HTML: grouped table — beneficiary header + expense detail rows
    const payeeGroupsHtml = payeeGroups.map((g) => {
      const accountDisplay = g.bankAccountNumber && g.bankCode
        ? `${escapeHtml(g.bankAccountNumber)}/${escapeHtml(g.bankCode)}`
        : "<em style='color:#ef4444'>chybí účet</em>";
      const itemRows = g.items.map((item) => `
        <tr>
          <td style="padding:5px 10px 5px 24px;border-bottom:1px solid #f3f4f6;font-size:13px;color:#374151;">${escapeHtml(item.purposeText)}</td>
          <td style="padding:5px 10px;border-bottom:1px solid #f3f4f6;font-size:12px;font-family:monospace;color:#6b7280;">${escapeHtml(item.purposeCategory)}</td>
          <td style="padding:5px 10px;border-bottom:1px solid #f3f4f6;font-size:13px;text-align:right;white-space:nowrap;color:#374151;">${formatAmount(item.amount)}&nbsp;Kč</td>
        </tr>`).join("");

      return `
        <tr style="background:#f0fdf4;">
          <td colspan="3" style="padding:10px 10px 8px;border-top:2px solid #86efac;border-bottom:1px solid #d1fae5;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td>
                  <span style="font-size:13px;font-weight:700;color:#111827;">${escapeHtml(g.payeeName)}</span>
                  &nbsp;&nbsp;<span style="font-size:12px;font-family:monospace;color:#6b7280;">${accountDisplay}</span>
                </td>
                <td style="text-align:right;white-space:nowrap;">
                  <span style="font-size:14px;font-weight:700;color:#327600;">${formatAmount(g.total)}&nbsp;Kč</span>
                </td>
              </tr>
              <tr>
                <td colspan="2" style="padding-top:4px;">
                  <span style="font-size:11px;color:#6b7280;">Zpráva:&nbsp;</span>
                  <span style="font-size:11px;color:#374151;font-style:italic;">${escapeHtml(g.paymentMessage)}</span>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        ${itemRows}
        <tr style="background:#f9fafb;">
          <td colspan="2" style="padding:6px 10px;text-align:right;font-size:12px;color:#6b7280;">Celkem ${escapeHtml(g.payeeName)}</td>
          <td style="padding:6px 10px;text-align:right;font-size:13px;font-weight:600;white-space:nowrap;color:#327600;">${formatAmount(g.total)}&nbsp;Kč</td>
        </tr>`;
    }).join(`<tr><td colspan="3" style="padding:8px 0;background:#ffffff;"></td></tr>`);

    const senderDisplay = session.user.name?.trim()
      ? `${session.user.name.trim()} (${session.user.email})`
      : session.user.email;

    const html = `<!DOCTYPE html>
<html lang="cs">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 16px;">
<tr><td align="center">
<table width="680" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;max-width:680px;width:100%;">

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
        v příloze zasíláme vyúčtování akce <strong>${escapeHtml(event.name)}</strong>
        včetně všech dokladů. CSV příloha obsahuje přehled pro bankovní převody.
      </p>

      <p style="margin:0 0 12px;font-size:12px;font-weight:700;color:#111827;text-transform:uppercase;letter-spacing:.05em;">
        Proplacení nákladů &mdash; podúčet oddílu 207
      </p>

      <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;margin:0 0 24px;">
        <thead>
          <tr style="background:#f3f4f6;">
            <th style="padding:7px 10px;text-align:left;font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:.04em;">Účel nákladu</th>
            <th style="padding:7px 10px;text-align:left;font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:.04em;">Kód</th>
            <th style="padding:7px 10px;text-align:right;font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:.04em;">Částka</th>
          </tr>
        </thead>
        <tbody>${payeeGroupsHtml}</tbody>
        <tfoot>
          <tr style="background:#dcfce7;border-top:2px solid #86efac;">
            <td colspan="2" style="padding:10px 10px;font-weight:700;font-size:13px;color:#111827;">Celkem k proplacení</td>
            <td style="padding:10px 10px;font-weight:700;font-size:15px;text-align:right;white-space:nowrap;color:#15803d;">${formatAmount(total)}&nbsp;Kč</td>
          </tr>
        </tfoot>
      </table>

      <p style="margin:0 0 8px;font-size:14px;color:#374151;line-height:1.6;">Děkuji,<br/>Tomáš Bauer<br/>Hospodář oddílu OVT</p>
    </td>
  </tr>

  <tr>
    <td style="padding:16px 32px 24px;border-top:1px solid #f3f4f6;">
      <p style="margin:0;font-size:12px;color:#9ca3af;line-height:1.5;">
        Oddíl Vodní Turistiky TJ Bohemians Praha &mdash;
        Odesláno ze správy OVT uživatelem ${escapeHtml(senderDisplay)}.
      </p>
    </td>
  </tr>

</table>
</td></tr>
</table>
</body>
</html>`;

    // Plain text version
    const textRows = payeeGroups.map((g) => {
      const account = g.bankAccountNumber && g.bankCode
        ? `${g.bankAccountNumber}/${g.bankCode}`
        : "bez účtu";
      const itemLines = g.items.map((item) =>
        `  - ${item.purposeText} (${item.purposeCategory}): ${formatAmount(item.amount)} Kč`,
      ).join("\n");
      return `${g.payeeName} | ${account} | celkem ${formatAmount(g.total)} Kč\n${itemLines}\nZpráva: ${g.paymentMessage}`;
    }).join("\n\n");

    const resend = getResendClient();
    const { data, error } = await resend.emails.send({
      from: settings.from,
      to: recipients,
      subject: `OVT vyúčtování akce: ${event.name}`,
      html,
      text: `Vyúčtování akce: ${event.name}\n\nKomu co proplatit:\n\n${textRows}\n\nCelkem: ${formatAmount(total)} Kč`,
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
      warnings: [],
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Interní chyba";
    console.error("[POST /api/events/[id]/send-vyuctovani]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
