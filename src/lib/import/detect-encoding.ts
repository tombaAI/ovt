import chardet from "chardet";
import type { DetectedEncoding } from "./types";

/**
 * Detekuje kódování souboru z raw bufferu.
 *
 * Strategie:
 * 1. UTF-8 BOM → jistá UTF-8
 * 2. chardet → pokud vrátí UTF-8 nebo windows-1250 s dostatečnou jistotou
 * 3. Jinak: vrátí "unknown" s encodingConfident=false
 *
 * Vrací: { encoding, confident }
 */
export function detectEncoding(buf: Buffer): { encoding: DetectedEncoding; confident: boolean } {
    // UTF-8 BOM (EF BB BF)
    if (buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF) {
        return { encoding: "utf-8", confident: true };
    }

    const detected = chardet.detect(buf);
    if (!detected) return { encoding: "unknown", confident: false };

    const name = typeof detected === "string" ? detected : (detected as { name: string }).name ?? "";

    const normalized = name.toLowerCase().replace(/[-_]/g, "");

    if (normalized.includes("utf8")) {
        return { encoding: "utf-8", confident: true };
    }
    if (
        normalized.includes("windows1250") ||
        normalized.includes("cp1250") ||
        normalized.includes("iso88592")
    ) {
        return { encoding: "win-1250", confident: true };
    }

    // Fallback heuristika: zkusíme UTF-8 validaci ručně
    if (isValidUtf8(buf)) {
        return { encoding: "utf-8", confident: false };
    }

    return { encoding: "win-1250", confident: false };
}

/** Jednoduchá UTF-8 validace — přítomnost high-byte sekvencí mimo UTF-8 rozsah */
function isValidUtf8(buf: Buffer): boolean {
    let i = 0;
    while (i < buf.length) {
        const byte = buf[i];
        let extraBytes = 0;
        if (byte <= 0x7F) {
            i++; continue;
        } else if ((byte & 0xE0) === 0xC0) {
            extraBytes = 1;
        } else if ((byte & 0xF0) === 0xE0) {
            extraBytes = 2;
        } else if ((byte & 0xF8) === 0xF0) {
            extraBytes = 3;
        } else {
            return false; // neplatný UTF-8 start byte
        }
        for (let j = 1; j <= extraBytes; j++) {
            if (i + j >= buf.length || (buf[i + j] & 0xC0) !== 0x80) return false;
        }
        i += 1 + extraBytes;
    }
    return true;
}
