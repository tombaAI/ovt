import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { generateObject } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { z } from "zod";

const cropSchema = z.object({
    detected: z.boolean().describe("Byl nalezen doklad na fotografii?"),
    x_pct:      z.number().min(0).max(1).nullable().describe("Levý kraj dokladu, relativní 0–1"),
    y_pct:      z.number().min(0).max(1).nullable().describe("Horní kraj dokladu, relativní 0–1"),
    width_pct:  z.number().min(0).max(1).nullable().describe("Šířka dokladu, relativní 0–1"),
    height_pct: z.number().min(0).max(1).nullable().describe("Výška dokladu, relativní 0–1"),
    confidence: z.number().min(0).max(1).describe("Jistota detekce"),
    note:       z.string().optional().describe("Volitelná poznámka k detekci"),
});

export type CropDetectionResult = z.infer<typeof cropSchema>;

const PROMPT = `Na fotografii najdi hlavní doklad, účtenku nebo fakturu.
Vrať souřadnice ohraničujícího obdélníku jako relativní hodnoty:
  0.0 = levý/horní kraj celé fotografie
  1.0 = pravý/dolní kraj celé fotografie
Pokud je doklad jasně viditelný: detected=true, vyplň souřadnice.
Pokud doklad není viditelný nebo jsi nejistý: detected=false, souřadnice null.
Snaž se být co nejpřesnější — ořez bude použit pro OCR čtení.`;

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
            { user: session.user.email, detected: object.detected, confidence: object.confidence }
        );

        return NextResponse.json(object);
    } catch (err) {
        const msg = err instanceof Error ? err.message : "Chyba detekce";
        console.error("[POST /api/expenses/detect-crop]", msg);
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}
