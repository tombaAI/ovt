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

const PROMPT = `Najdi fyzické okraje dokladu, účtenky nebo papíru na fotografii.

PRIMÁRNÍ ÚKOL — hledej hranici papíru pomocí kontrastu:
Papír (typicky bílý nebo světlý) leží na podkladu jiné barvy nebo textury (stůl, ruka, peněženka, tmavší plocha).
Hledej přesně tu linii, kde papír končí a začíná podklad.
Ořez musí zahrnovat CELÝ papír — včetně prázdných okrajů bez textu nahoře, dole, vlevo, vpravo.

PRAVIDLA PRO PŘESNOST:
- Nikdy neořezávej jen oblast s textem. Zahrni fyzický okraj papíru.
- Buď štědrý: je lepší zahrnout 2–3 % navíc než oříznout kousek papíru.
- Pokud papír sahá až k okraji fotografie, nastav tu stranu na 0.0 nebo 1.0.
- Pokud je papír přeložený nebo skrčený, hledej vnější ohraničující obdélník celé viditelné plochy.
- Pokud je papír na uniformním pozadí bez zřetelného kontrastu, hledej stín nebo jemnou hranu.

DOPLŇKOVÝ ÚKOL — po nalezení fyzických hranic ověř:
Zkontroluj zda jsou klíčová pole (název firmy, IČ, DIČ, celková částka) uvnitř nalezeného ořezu.
Pokud ne, rozšiř ořez — nikdy ho nezužuj pod fyzické hranice papíru.

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
