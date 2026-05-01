import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { generateObject } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { z } from "zod";

const fieldsCheckSchema = z.object({
    company_name:  z.boolean().describe("Je název firmy/obchodníka CELÝ uvnitř ořezu?"),
    ico:           z.boolean().nullable().describe("Je IČ CELÉ uvnitř ořezu? null pokud na dokladu není."),
    dic:           z.boolean().nullable().describe("Je DIČ CELÉ uvnitř ořezu? null pokud na dokladu není."),
    total_amount:  z.boolean().describe("Je celková částka CELÁ uvnitř ořezu? (nadpis i hodnota)"),
});

const cropSchema = z.object({
    detected:     z.boolean().describe("Byl nalezen doklad nebo papír na fotografii?"),
    x_pct:        z.number().min(0).max(1).nullable().describe("Levý okraj papíru, relativní 0–1"),
    y_pct:        z.number().min(0).max(1).nullable().describe("Horní okraj papíru, relativní 0–1"),
    width_pct:    z.number().min(0).max(1).nullable().describe("Šířka papíru, relativní 0–1"),
    height_pct:   z.number().min(0).max(1).nullable().describe("Výška papíru, relativní 0–1"),
    confidence:   z.number().min(0).max(1).describe("Jistota detekce fyzických okrajů"),
    fields_check: fieldsCheckSchema.describe("Doplňková kontrola: jsou klíčová pole uvnitř ořezu?"),
    note:         z.string().optional(),
});

export type CropDetectionResult = z.infer<typeof cropSchema>;
export type FieldsCheck         = z.infer<typeof fieldsCheckSchema>;

const PROMPT = `Tvým úkolem je nalézt doklad, účtenku nebo papír na fotografii a určit ořez, který zaručeně obsahuje CELÝ doklad.

HLAVNÍ PRAVIDLO — ořez musí být VNĚ dokumentu:
Vrať souřadnice, které jsou o kousek větší než skutečný okraj papíru.
Klidně zahrň trochu pozadí (stůl, ruka, tma) — to nevadí.
NESMÍ se stát, že ořez ukrojí byť jen milimetr z papíru.

JAK NAJÍT DOKLAD:
Hledej přechod barvy a textury — světlý papír kontrastuje s tmavším podkladem.
Zahrni celý papír včetně prázdných okrajů bez tisku (nahoře, dole, vlevo, vpravo).

KONKRÉTNÍ POSTUP:
1. Najdi čtyři fyzické hrany papíru (ne hrany textu).
2. Každou hranu posuň o 2–3 % NADE, resp. za okraj (tj. do pozadí).
3. Výsledek jsou souřadnice, které vrátíš.

SPECIÁLNÍ PŘÍPADY:
- Papír sahá k okraji fotky → nastav tu stranu na 0.0 nebo 1.0.
- Uniformní pozadí bez kontrastu → hledej stín nebo lehkou hranu, pak buď velkorysý.
- Pokrčený nebo přeložený papír → vezmi vnější ohraničující obdélník celé viditelné plochy.

DOPLŇKOVÁ KONTROLA (po určení ořezu):
Ověř zda jsou název firmy, IČ, DIČ a celková částka celé uvnitř. Pokud ne, rozšiř ořez.

Pokud doklad není viditelný: detected=false, souřadnice null.`;

export async function POST(request: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user?.email) {
            return NextResponse.json({ error: "Nepřihlášen" }, { status: 401 });
        }

        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            return NextResponse.json({ error: "GEMINI_API_KEY není nastaven" }, { status: 503 });
        }

        const formData = await request.formData();
        const file = formData.get("file") as File | null;
        if (!file || file.size === 0) {
            return NextResponse.json({ error: "Chybí soubor" }, { status: 400 });
        }

        const bytes  = await file.arrayBuffer();
        const buffer = Buffer.from(bytes);

        const modelId = process.env.GEMINI_CROP_MODEL ?? "gemini-2.5-flash";
        const google  = createGoogleGenerativeAI({ apiKey });

        const { object, usage } = await generateObject({
            model: google(modelId),
            schema: cropSchema,
            messages: [{
                role: "user",
                content: [
                    { type: "image" as const, image: buffer, mediaType: file.type },
                    { type: "text"  as const, text: PROMPT },
                ],
            }],
        });

        console.info(
            `[Gemini crop] model:${modelId} in:${usage.inputTokens} out:${usage.outputTokens}`,
            { user: session.user.email, detected: object.detected, confidence: object.confidence, fields: object.fields_check }
        );

        return NextResponse.json(object);
    } catch (err) {
        const msg = err instanceof Error ? err.message : "Chyba detekce";
        console.error("[POST /api/expenses/detect-crop]", msg);
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}
