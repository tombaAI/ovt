import fs from "node:fs";
import path from "node:path";

import { test as setup } from "@playwright/test";
import { encode } from "next-auth/jwt";

// Aplikace má jen Google OAuth — testy se nepřihlašují přes Google, ale podepíšou si
// vlastní Auth.js JWT session cookie stejným AUTH_SECRET, jaký má testovaný server.
// Kontrola app.admin_users běží jen v signIn callbacku (při reálném loginu); middleware
// i server actions JWT pouze dekódují, takže podepsaná cookie plně stačí.

export const E2E_ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? "e2e-admin@test.local";

const SESSION_COOKIE = "authjs.session-token"; // http:// varianta (bez __Secure- prefixu)
const authFile = path.join(__dirname, ".auth", "session.json");

setup("podepsat session cookie testovacího admina", async ({ baseURL }) => {
    const secret = process.env.AUTH_SECRET;
    if (!secret) throw new Error("AUTH_SECRET musí být nastaven (stejný jako pro testovaný server)");

    const token = await encode({
        token: { name: "E2E Admin", email: E2E_ADMIN_EMAIL, sub: "e2e-admin" },
        secret,
        salt: SESSION_COOKIE,
        maxAge: 60 * 60,
    });

    const { hostname } = new URL(baseURL!);
    fs.mkdirSync(path.dirname(authFile), { recursive: true });
    fs.writeFileSync(authFile, JSON.stringify({
        cookies: [{
            name: SESSION_COOKIE,
            value: token,
            domain: hostname,
            path: "/",
            expires: Math.floor(Date.now() / 1000) + 60 * 60,
            httpOnly: true,
            secure: false,
            sameSite: "Lax",
        }],
        origins: [],
    }, null, 2));
});
