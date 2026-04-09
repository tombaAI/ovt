/**
 * Fio Banka API konektor
 *
 * Dokumentace: https://www.fio.cz/docs/cz/API_Bankovnictvi.pdf
 * Rate limit: max 1 request / 30 sekund na token — voláme pouze z server-side kódu.
 */

const FIO_BASE = "https://fioapi.fio.cz/v1/rest";

export interface FioTransaction {
    fioId:               number;
    date:                string;   // ISO "YYYY-MM-DD"
    amount:              number;   // celé Kč (zaokrouhleno)
    currency:            string;
    variableSymbol:      string | null;
    constantSymbol:      string | null;
    specificSymbol:      string | null;
    counterpartyAccount: string | null;
    counterpartyName:    string | null;
    message:             string | null;
    userIdentification:  string | null;
    type:                string | null;
    comment:             string | null;
    rawData:             Record<string, unknown>;
}

// ── Parsování odpovědi Fio API ────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function col(columns: Record<string, any>, name: string): string | null {
    return columns[name]?.value ?? null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseRow(row: Record<string, any>): FioTransaction {
    const columns = row;
    const rawAmount = parseFloat(col(columns, "column1") ?? "0");
    return {
        fioId:               Number(col(columns, "column22")),
        date:                (col(columns, "column0") ?? "").substring(0, 10),
        amount:              Math.round(rawAmount),
        currency:            col(columns, "column14") ?? "CZK",
        variableSymbol:      col(columns, "column5"),
        constantSymbol:      col(columns, "column4"),
        specificSymbol:      col(columns, "column6"),
        counterpartyAccount: col(columns, "column2"),
        counterpartyName:    col(columns, "column10"),
        message:             col(columns, "column16"),
        userIdentification:  col(columns, "column7"),
        type:                col(columns, "column8"),
        comment:             col(columns, "column25"),
        rawData:             columns,
    };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseResponse(json: any): FioTransaction[] {
    const transactions = json?.accountStatement?.transactionList?.transaction;
    if (!Array.isArray(transactions)) return [];
    return transactions.map(parseRow);
}

// ── Interní fetch s retry na 409 (rate limit) ────────────────────────────────

const RATE_LIMIT_WAIT_MS = 35_000; // Fio rate limit: 1 req / 30s, čekáme 35s pro jistotu

async function fioFetch(url: string): Promise<FioTransaction[]> {
    let res = await fetch(url);

    if (res.status === 409) {
        // Rate limit — počkáme a zkusíme znovu jednou
        console.log("[fio] 409 rate limit, čekám 35s a opakuji...");
        await new Promise(r => setTimeout(r, RATE_LIMIT_WAIT_MS));
        res = await fetch(url);
    }

    if (!res.ok) throw new Error(`Fio API chyba: ${res.status} ${res.statusText}`);
    return parseResponse(await res.json());
}

// ── Veřejné funkce ────────────────────────────────────────────────────────────

function getToken(): string {
    const token = process.env.FIO_TOKEN;
    if (!token) throw new Error("FIO_TOKEN není nastaven v prostředí.");
    return token;
}

/**
 * Načte platby za dané období (YYYY-MM-DD).
 * Max rozsah: 360 dní (Fio limit je nominálně 365, ale inclusivní počítání může přesáhnout).
 */
export async function fetchFioByPeriod(from: string, to: string): Promise<FioTransaction[]> {
    const token = getToken();
    const url = `${FIO_BASE}/periods/${token}/${from}/${to}/transactions.json`;
    return fioFetch(url);
}

/**
 * Načte platby od posledního stažení (Fio si pamatuje bookmark).
 * Vhodné pro inkrementální sync (cron).
 */
export async function fetchFioLast(): Promise<FioTransaction[]> {
    const token = getToken();
    const url = `${FIO_BASE}/last/${token}/transactions.json`;
    return fioFetch(url);
}
