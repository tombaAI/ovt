import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { generateObject } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { z } from "zod";
import { expenseCategoryEnum } from "@/lib/expense-categories";
import type { ExpenseCategory } from "@/lib/expense-categories";

// Detailní prompt pro účetní kategorizaci dle číselníku TJ Bohemians.
// Přepsatelný přes env GEMINI_EXTRACTION_PROMPT (Vercel Dashboard → Settings → Env Vars).
const DEFAULT_PROMPT = `Jsi expertní český účetní pracující pro sportovní klub. Tvým úkolem je analyzovat přiloženou účtenku nebo fakturu z oddílové akce a kategorizovat ji do přesně jednoho z předdefinovaných účetních kódů nákladů.

Nemáš přístup k internetu. Musíš logicky odvodit typ zboží nebo služby na základě názvu obchodníka (např. Decathlon = sport, České dráhy = doprava, Kaufland/Tesco = potraviny/kancelář, restaurace = stravování) a rozpisu položek na účtence.

Zde je tvůj číselník povolených nákladových účtů s pravidly pro rozhodování:

Materiál (fyzické věci):
- "501/004": Kancelářské potřeby, ostatní materiál. (Např. papíry, tonery, pera, ale i drobný nesportovní nákup, potraviny pro pořadatele, pitný režim - voda, úklidové prostředky).
- "501/006": Spotřeba sportovního materiálu. (Např. míče, dresy, tejpovací pásky, sportovní výživa, florbalové hokejky, sítě, medaile, poháry).

Služby a ostatní (nehmotné, práce, poplatky):
- "511/002": Oprava sportovních potřeb. (Např. vyplétání raket, oprava dresů, servis kol).
- "518/001": Nájem tělocvičen, bazénů. (Pronájem sportovišť, hal, ledové plochy, dráhy).
- "518/003": Spoje. (Telefonní poplatky, internet, kredit, SIM karty pro akci).
- "518/004": Poštovné. (Služby České pošty, Zásilkovna, kurýři DPD/PPL - pouze pokud je to samostatný výdaj, ne jako součást nákupu materiálu).
- "518/008": Startovné, registrace. (Poplatky za účast na turnajích, svazové poplatky, licence).
- "518/009": Soutěže, ubytování, doprava. (Klíčový účet pro akce: Jízdenky na vlak/autobus, účtenky za benzín/PHM, faktury za hotel/penzion/ubytovnu, stravování celého týmu na akci, pronájem autobusu).
- "518/010": Služby - náklady na přípravu. (Specifické trenérské a přípravné služby mimo soustředění).
- "518/011": Služby - náklady na soustředění. (Komplexní faktury za letní/zimní soustředění).
- "518/012": Služby - mezinárodní činnost. (Služby spojené s výjezdem do zahraničí, víza, zahraniční poplatky).
- "518/014": Přestupy, hostování. (Poplatky svazu za přestupy hráčů).
- "549/004": Odměny rozhodčím. (Výdajové pokladní doklady nebo faktury od rozhodčích, delegátů).

Pravidla pro zpracování:
1. Pokud účtenka obsahuje položky z více kategorií, vyber kategorii podle položky s NEJVYŠŠÍ FINANČNÍ HODNOTOU.
2. Účtenky za benzín/naftu, vlak, autobus a hotely zařaď VŽDY do "518/009".
3. Pokud si nejsi absolutně jistý, přikloň se u fyzických věcí k "501/004" a u služeb k "518/009".
4. Výstup musí být striktně ve formátu JSON, nic jiného nepiš.`;

const resultSchema = z.object({
    merchant:      z.string().describe("Název obchodníka nebo dodavatele"),
    date:          z.string().nullable().describe("Datum dokladu YYYY-MM-DD, null pokud nečitelné"),
    total_amount:  z.number().nullable().describe("Celková částka s DPH jako číslo"),
    currency:      z.string().default("CZK").describe("Měna, např. CZK nebo EUR"),
    account_code:  z.enum(expenseCategoryEnum as unknown as [ExpenseCategory, ...ExpenseCategory[]])
                    .nullable().describe("Účetní kód nákladového účtu"),
    category_name: z.string().describe("Název kategorie dle číselníku"),
    reasoning:     z.string().describe("Zdůvodnění výběru účtu, max 2 věty česky"),
    confidence:    z.number().min(0).max(1).describe("Jistota zařazení od 0 do 1"),
});

export type ExpenseAnalysis = z.infer<typeof resultSchema>;

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
            { user: session.user.email, merchant: object.merchant, code: object.account_code, amount: object.total_amount }
        );

        return NextResponse.json(object);
    } catch (err) {
        const msg = err instanceof Error ? err.message : "Chyba analýzy";
        console.error("[POST /api/expenses/analyze]", msg);
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}
