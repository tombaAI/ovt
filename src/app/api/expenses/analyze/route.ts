import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { generateObject } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { z } from "zod";
import { expenseCategoryEnum, EXPENSE_CATEGORY_LABELS } from "@/lib/expense-categories";
import type { ExpenseCategory } from "@/lib/expense-categories";

const CATEGORY_LIST = expenseCategoryEnum
    .map(k => `${k} (${EXPENSE_CATEGORY_LABELS[k]})`)
    .join(", ");

const DEFAULT_PROMPT =
    `Analyzuj přiložený doklad nebo účtenku. Jde o výdaj sportovního oddílu.
Urči celkovou částku k úhradě v Kč a kategorii výdaje.
Kategorie: ${CATEGORY_LIST}.
Pokud částku nelze přečíst, vrať null. Pokud kategorie není jasná, použij "ostatni".`;

const resultSchema = z.object({
    amount:   z.number().nullable().describe("Celková částka v Kč, null pokud nelze přečíst"),
    category: z.enum(expenseCategoryEnum as unknown as [ExpenseCategory, ...ExpenseCategory[]])
               .nullable().describe("Klíč kategorie výdaje"),
});

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
        const prompt = process.env.GEMINI_EXTRACTION_PROMPT ?? DEFAULT_PROMPT;

        const google = createGoogleGenerativeAI({ apiKey });

        const { object, usage } = await generateObject({
            model: google("gemini-2.0-flash-lite"),
            schema: resultSchema,
            messages: [{
                role: "user",
                content: [
                    file.type === "application/pdf"
                        ? { type: "file"  as const, data: buffer, mediaType: "application/pdf" as const }
                        : { type: "image" as const, image: buffer, mediaType: file.type },
                    { type: "text" as const, text: prompt },
                ],
            }],
        });

        console.info(
            `[Gemini] expense analyze — in:${usage.inputTokens} out:${usage.outputTokens}`,
            { user: session.user.email, result: object }
        );

        return NextResponse.json(object);
    } catch (err) {
        const msg = err instanceof Error ? err.message : "Chyba analýzy";
        console.error("[POST /api/expenses/analyze]", msg);
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}
