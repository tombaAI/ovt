import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { analyzeExpenseFile, ExpenseAnalysisConfigError } from "@/lib/expense-analysis";

export type { ExpenseAnalysis } from "@/lib/expense-analysis";

export async function POST(request: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user?.email) {
            return NextResponse.json({ error: "Nepřihlášen" }, { status: 401 });
        }

        const formData = await request.formData();
        const file = formData.get("file") as File | null;
        if (!file || file.size === 0) {
            return NextResponse.json({ error: "Chybí soubor" }, { status: 400 });
        }

        const object = await analyzeExpenseFile(file, { user: session.user.email, source: "analyze" });
        return NextResponse.json(object);
    } catch (err) {
        if (err instanceof ExpenseAnalysisConfigError) {
            return NextResponse.json({ error: err.message }, { status: 503 });
        }
        const msg = err instanceof Error ? err.message : "Chyba analýzy";
        console.error("[POST /api/expenses/analyze]", msg);
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}
