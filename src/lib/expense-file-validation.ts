const IMAGE_PDF_MIME = new Set([
    "image/jpeg", "image/png", "image/webp", "image/heic",
    "application/pdf",
]);

export const EXPENSE_SPREADSHEET_MIME = new Set([
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);

export const EXPENSE_ALLOWED_MIME = new Set([...IMAGE_PDF_MIME, ...EXPENSE_SPREADSHEET_MIME]);

function hasSpreadsheetExtension(fileName: string | null | undefined): boolean {
    return /\.(xlsx|xls)$/i.test(fileName ?? "");
}

/** Je to spreadsheet? MIME shoda, nebo (fallback) přípona .xls/.xlsx — browser MIME bývá u Office souborů nespolehlivé. */
export function isSpreadsheetFile(mime: string, fileName?: string | null): boolean {
    return EXPENSE_SPREADSHEET_MIME.has(mime) || hasSpreadsheetExtension(fileName);
}

/** Je typ souboru povolený jako příloha nákladu (obrázek, PDF, nebo spreadsheet)? */
export function isAllowedExpenseFile(mime: string, fileName?: string | null): boolean {
    return EXPENSE_ALLOWED_MIME.has(mime) || hasSpreadsheetExtension(fileName);
}

/**
 * MIME typ, který se smí uložit jako Content-Type přílohy (blob storage + DB).
 * Nikdy nevrací syrový, klientem deklarovaný `mime` mimo náš vlastní bezpečný seznam —
 * `isAllowedExpenseFile` povoluje XLS/XLSX i s nedůvěryhodným MIME podle přípony, ale
 * bez tohohle by se attacker-controlled hodnota (např. "text/html") uložila do
 * Content-Type a `/api/blob-file` proxy by ji s `Content-Disposition: inline` servírovala
 * zpět — prohlížeč by ji vykreslil jako HTML/skript (stored XSS). Volat až po
 * `isAllowedExpenseFile()` vrátivším true.
 */
export function resolveExpenseFileMime(mime: string, fileName?: string | null): string {
    if (EXPENSE_ALLOWED_MIME.has(mime)) return mime;
    if (/\.xlsx$/i.test(fileName ?? "")) return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    if (/\.xls$/i.test(fileName ?? "")) return "application/vnd.ms-excel";
    return "application/octet-stream";
}
