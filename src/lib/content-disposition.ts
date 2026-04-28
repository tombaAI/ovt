function sanitizeAsciiSegment(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function encodeRfc5987(value: string): string {
  return encodeURIComponent(value)
    .replace(/['()]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`)
    .replace(/\*/g, "%2A");
}

export function buildPdfAttachmentDisposition(baseName: string, dynamicPart?: string): string {
  const rawDynamic = (dynamicPart ?? "").trim();
  const safeBase = sanitizeAsciiSegment(baseName) || "document";
  const safeDynamic = sanitizeAsciiSegment(rawDynamic);

  const fallbackFilename = `${safeBase}${safeDynamic ? `-${safeDynamic}` : ""}.pdf`;
  const utf8Filename = `${baseName}${rawDynamic ? `-${rawDynamic.replace(/\s+/g, "-")}` : ""}.pdf`;

  return `attachment; filename="${fallbackFilename}"; filename*=UTF-8''${encodeRfc5987(utf8Filename)}`;
}