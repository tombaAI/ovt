import { auth } from "@/auth";
import { NextResponse } from "next/server";

export default auth((req) => {
    const isAuthed = Boolean(req.auth);
    const { pathname } = req.nextUrl;

    if (pathname === "/login" && isAuthed) {
        return NextResponse.redirect(new URL("/dashboard", req.url));
    }

    const isProtected = pathname === "/" || pathname.startsWith("/dashboard");
    if (isProtected && !isAuthed) {
        return NextResponse.redirect(new URL("/login", req.url));
    }

    return NextResponse.next();
});

export const config = {
    matcher: ["/((?!api/auth|api/health|api/email|_next|favicon\\.ico|health).*)"]
};
