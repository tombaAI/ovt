import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";

export async function GET(request: NextRequest) {
    const session = await auth();
    if (!session?.user?.email) {
        return new NextResponse("Unauthorized", { status: 401 });
    }

    const url = request.nextUrl.searchParams.get("url");
    if (!url) {
        return new NextResponse("Missing url", { status: 400 });
    }

    // Povolujeme pouze Vercel Blob URLs
    if (!url.match(/^https:\/\/[^/]+\.blob\.vercel-storage\.com\//)) {
        return new NextResponse("Invalid URL", { status: 400 });
    }

    const token = process.env.BLOB_READ_WRITE_TOKEN;
    if (!token) {
        return new NextResponse("Storage not configured", { status: 500 });
    }

    const blobRes = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
    });

    if (!blobRes.ok) {
        return new NextResponse("File not found", { status: 404 });
    }

    const contentType = blobRes.headers.get("Content-Type") ?? "application/octet-stream";
    const filename = url.split("/").pop() ?? "soubor";

    return new NextResponse(blobRes.body, {
        headers: {
            "Content-Type": contentType,
            "Content-Disposition": `inline; filename="${filename}"`,
            "Cache-Control": "private, max-age=300",
        },
    });
}
