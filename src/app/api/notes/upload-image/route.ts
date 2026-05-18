import { put } from "@vercel/blob";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";

const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5 MB

export async function POST(request: NextRequest) {
    const session = await auth();
    if (!session?.user?.email) {
        return NextResponse.json({ error: "Nepřihlášen" }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get("image") as File | null;

    if (!file || file.size === 0) {
        return NextResponse.json({ error: "Chybí soubor" }, { status: 400 });
    }
    if (!ALLOWED_MIME.has(file.type)) {
        return NextResponse.json({ error: "Nepodporovaný formát (povoleno: JPEG, PNG, WebP, GIF)" }, { status: 400 });
    }
    if (file.size > MAX_FILE_BYTES) {
        return NextResponse.json({ error: "Soubor je příliš velký (max 5 MB)" }, { status: 400 });
    }

    const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
    const safeName = `notes/images/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

    const blob = await put(safeName, file, {
        access: "public",
        contentType: file.type,
    });

    return NextResponse.json({ url: blob.url });
}
