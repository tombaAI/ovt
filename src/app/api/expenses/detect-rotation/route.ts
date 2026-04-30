import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { generateObject } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { z } from "zod";

const rotationSchema = z.object({
    rotation_needed: z.boolean().describe("Je potřeba obrázek otočit?"),
    angle_degrees:   z.number().min(-180).max(180).describe(
        "Úhel otočení ve stupních (kladný = po směru hodinových ručiček). " +
        "Preferuj násobky 90° pro kardinalní rotace. " +
        "Pro mírné natočení použij hodnoty jako -5, 12 apod."
    ),
    confidence: z.number().min(0).max(1).describe("Jistota detekce"),
    note:       z.string().optional().describe("Volitelná poznámka"),
});

export type RotationDetectionResult = z.infer<typeof rotationSchema>;

const PROMPT = `Analyzuj orientaci dokladu nebo účtenky na fotografii.
Urči, o kolik stupňů je potřeba obrázek otočit, aby byl doklad čitelný — text vodorovně, čitelný zleva doprava.

Pravidla:
- Kladný úhel = otočit po směru hodinových ručiček
- Záporný úhel = otočit proti směru hodinových ručiček
- Pokud je obrázek správně orientovaný: rotation_needed=false, angle_degrees=0
- Preferuj přesné hodnoty jako 90, -90, 180 pro kardinalní rotace
- Pro mírně šikmý doklad použij přibližný úhel (např. -8 nebo 12)`;

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
            { user: session.user.email, angle: object.angle_degrees, confidence: object.confidence }
        );

        return NextResponse.json(object);
    } catch (err) {
        const msg = err instanceof Error ? err.message : "Chyba detekce";
        console.error("[POST /api/expenses/detect-rotation]", msg);
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}
