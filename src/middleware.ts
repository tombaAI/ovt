import { auth } from "@/auth";
import { NextResponse } from "next/server";

export default auth((req) => {
    const isAuthed = Boolean(req.auth);
    const { pathname } = req.nextUrl;
    const hostname = req.headers.get("host") ?? "";
    const isIsDomain = hostname.startsWith("is.");

    if (pathname === "/dashboard/vyuctovani") {
        const url = req.nextUrl.clone();
        url.pathname = "/dashboard/forms";
        return NextResponse.redirect(url);
    }

    // Na subdoméně is. přesměrovat kořen rovnou na dashboard
    if (isIsDomain && pathname === "/") {
        return NextResponse.redirect(new URL("/dashboard", req.url));
    }

    if (pathname === "/login" && isAuthed) {
        return NextResponse.redirect(new URL("/dashboard", req.url));
    }

    if (pathname.startsWith("/dashboard") && !isAuthed) {
        return NextResponse.redirect(new URL("/login", req.url));
    }

    return NextResponse.next();
});

export const config = {
    matcher: ["/((?!api/auth|api/health|api/email|_next|favicon\\.ico|health).*)"]
};
