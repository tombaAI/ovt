/**
 * Stáhne privátní Vercel Blob soubor server-side (autorizace přes BLOB_READ_WRITE_TOKEN)
 * a vrátí ho jako `File` — vhodné pro předání do analyzeExpenseFile bez roundtripu přes klienta.
 * Stejný autorizační vzor jako /api/blob-file, jen bez HTTP hopu přes prohlížeč.
 */
export async function fetchPrivateBlobAsFile(
    url: string,
    fileName: string | null | undefined,
    mime: string | null | undefined,
): Promise<File> {
    const token = process.env.BLOB_READ_WRITE_TOKEN;
    if (!token) throw new Error("Úložiště není nakonfigurováno (BLOB_READ_WRITE_TOKEN)");

    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error("Nepodařilo se načíst přiložený soubor");

    const contentType = mime ?? res.headers.get("Content-Type") ?? "application/octet-stream";
    const buffer = await res.arrayBuffer();
    return new File([buffer], fileName ?? "document", { type: contentType });
}
