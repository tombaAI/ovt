import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { generateObject } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { z } from "zod";

const fieldsCheckSchema = z.object({
    company_name:  z.boolean().describe("Je název firmy/obchodníka CELÝ uvnitř ořezu? (nadpis i hodnota)"),
    ico:           z.boolean().nullable().describe("Je IČ CELÉ uvnitř ořezu? null pokud IČ na dokladu není."),
    dic:           z.boolean().nullable().describe("Je DIČ CELÉ uvnitř ořezu? null pokud DIČ na dokladu není."),
    total_amount:  z.boolean().describe("Je celková částka CELÁ uvnitř ořezu? (nadpis 'Celkem'/'Total' i číselná hodnota)"),
});

const cropSchema = z.object({
    detected:     z.boolean().describe("Byl nalezen doklad na fotografii?"),
    x_pct:        z.number().min(0).max(1).nullable().describe("Levý kraj dokladu, relativní 0–1"),
    y_pct:        z.number().min(0).max(1).nullable().describe("Horní kraj dokladu, relativní 0–1"),
    width_pct:    z.number().min(0).max(1).nullable().describe("Šířka dokladu, relativní 0–1"),
    height_pct:   z.number().min(0).max(1).nullable().describe("Výška dokladu, relativní 0–1"),
    confidence:   z.number().min(0).max(1).describe("Jistota detekce ořezu"),
    fields_check: fieldsCheckSchema.describe("Ověření, že klíčové informace nejsou mimo navržený ořez"),
    note:         z.string().optional().describe("Volitelná poznámka k detekci"),
});

export type CropDetectionResult = z.infer<typeof cropSchema>;
export type FieldsCheck         = z.infer<typeof fieldsCheckSchema>;

const PROMPT = `Na fotografii najdi hlavní doklad, účtenku nebo fakturu.

1. OŘEZ: Vrať ohraničující obdélník jako relativní hodnoty (0.0 = levý/horní kraj, 1.0 = pravý/dolní kraj).

2. OVĚŘENÍ POLÍ: Pro navržený ořez ověř, zda jsou CELÉ uvnitř (jak popisek/nadpis, tak hodnota):
   - Název firmy / obchodníka
   - IČ (identifikační číslo) — pokud na dokladu není, vrať null
   - DIČ (daňové identifikační číslo) — pokud na dokladu není, vrať null
   - Celková částka k úhradě (nadpis i číselná hodnota)

Pokud navržený ořez by některé z těchto polí oříznul nebo nechal mimo, uprav ořez tak, aby vše obsahoval.
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
