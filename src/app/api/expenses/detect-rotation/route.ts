import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { generateObject } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { z } from "zod";

const rotationSchema = z.object({
    text_samples: z.array(z.string()).describe(
        "2-4 ukázky textu nalezené na obrázku (tak jak by vypadaly správně orientované — přeložit do správné podoby). " +
        "Použij krátké fragmenty: název firmy, datum, čísla, slova z položek."
    ),
    text_direction: z.enum([
        "correct",       // text teče zleva doprava, vodorovně
        "rotated_cw90",  // text teče shora dolů (otočeno o 90° po směru)
        "rotated_ccw90", // text teče zdola nahoru (otočeno o 90° proti směru)
        "upside_down",   // text je vzhůru nohama (180°)
        "slight_tilt",   // text je mírně nakloněn (<30°)
    ]).describe("Jak text aktuálně teče na fotografii — určeno z přečteného textu, ne z tvaru dokumentu"),
    rotation_needed: z.boolean(),
    angle_degrees:   z.number().min(-180).max(180).describe(
        "Úhel k otočení PO SMĚRU hodinových ručiček pro správnou orientaci textu. " +
        "correct→0, rotated_cw90→-90, rotated_ccw90→+90, upside_down→180, slight_tilt→přibližný úhel."
    ),
    confidence: z.number().min(0).max(1).describe("Jistota detekce, 1 = absolutní jistota"),
    note:       z.string().optional(),
});

export type RotationDetectionResult = z.infer<typeof rotationSchema>;

const PROMPT = `Postupuj ve dvou krocích:

KROK 1 — Přečti text:
Prohlédni fotografii a přečti veškerý viditelný text. Vyber 2-4 krátké ukázky (název firmy, datum, čísla, slova z položek). Zapiš je v jejich přirozené správné podobě (jak by vypadaly správně orientované).

KROK 2 — Urči orientaci z textu:
Podívej se, JAK text aktuálně teče na fotografii:
- Zleva doprava, vodorovně → text_direction="correct", angle_degrees=0
- Shora dolů (otočeno doprava) → text_direction="rotated_cw90", angle_degrees=-90
- Zdola nahoru (otočeno doleva) → text_direction="rotated_ccw90", angle_degrees=+90
- Vzhůru nohama → text_direction="upside_down", angle_degrees=180
- Mírně nakloněn (<30°) → text_direction="slight_tilt", angle_degrees=odhadni přibližný úhel

KLÍČOVÉ PRAVIDLO: Orientaci urči VÝHRADNĚ z přečteného textu. Ignoruj tvar dokumentu, orientaci fotografie nebo EXIF metadata. Pokud najdeš text, měl bys být velmi jistý (confidence > 0.85).`;

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
            schema: rotationSchema,
            messages: [{
                role: "user",
                content: [
                    { type: "image" as const, image: buffer, mediaType: file.type },
                    { type: "text"  as const, text: PROMPT },
                ],
            }],
        });

        console.info(
            `[Gemini rotation] model:${modelId} in:${usage.inputTokens} out:${usage.outputTokens}`,
            { user: session.user.email, direction: object.text_direction, angle: object.angle_degrees, confidence: object.confidence, text: object.text_samples }
        );

        return NextResponse.json(object);
    } catch (err) {
        const msg = err instanceof Error ? err.message : "Chyba detekce";
        console.error("[POST /api/expenses/detect-rotation]", msg);
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}
