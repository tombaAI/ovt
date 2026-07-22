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
