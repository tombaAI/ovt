import { expect, test } from "@playwright/test";
import { encode } from "next-auth/jwt";

// Smoke testy — chytají "aplikace se slepila": stránka se nevykreslí, auth nefunguje,
// data netečou z DB do UI. Detailní chování výpočtů hlídají unit testy (Vitest).

test.describe("nepřihlášený uživatel", () => {
    test.use({ storageState: { cookies: [], origins: [] } });

    test("/dashboard přesměruje na /login", async ({ page }) => {
        await page.goto("/dashboard");
        await expect(page).toHaveURL(/\/login/);
        await expect(page.getByText("Přihlásit se přes Google")).toBeVisible();
    });
});

test.describe("přihlášený admin", () => {
    // Každá stránka se musí vykreslit s navigací a bez error boundary Next.js.
    const pages = [
        { path: "/dashboard", probe: /Vítej/ },
        { path: "/dashboard/members", probe: /Jan Testovací/ },
        { path: "/dashboard/contributions", probe: /Jan Testovací|Testovací/ },
        { path: "/dashboard/payments", probe: /./ },
        { path: "/dashboard/events", probe: /./ },
        { path: "/dashboard/boats", probe: /./ },
        { path: "/dashboard/provoz", probe: /./ },
    ];

    for (const { path, probe } of pages) {
        test(`stránka ${path} se vykreslí`, async ({ page }) => {
            await page.goto(path);
            await expect(page).toHaveURL(new RegExp(path.replace(/\//g, "\\/")));
            // Navigace admin layoutu = middleware pustil, layout se vyrenderoval
            await expect(page.getByRole("link", { name: "Členové" }).first()).toBeVisible();
            // filter({ visible: true }) — stránky renderují responzivní varianty (mobil skrytý)
            await expect(page.getByText(probe).filter({ visible: true }).first()).toBeVisible();
            // Server/client error boundary se nesmí objevit
            await expect(page.getByText(/Application error|Něco se pokazilo/)).toHaveCount(0);
        });
    }

    test("detail člena zobrazí seedovaná data", async ({ page }) => {
        await page.goto("/dashboard/members");
        await page.getByText("Jan Testovací").filter({ visible: true }).first().click();
        // Klik na řádek otevírá inline detail přes history.pushState na /dashboard/members/{id}
        await expect(page).toHaveURL(/\/dashboard\/members\/\d+/);
        await expect(page.getByText("Jan Testovací").filter({ visible: true }).first()).toBeVisible();
        await expect(page.getByText("jan.testovaci@test.local").filter({ visible: true }).first()).toBeVisible();
    });
});

test.describe("provozní výdaje", () => {
    test("hospodář založí výdaj; nezobrazí se v kalendáři, zobrazí se v Provozu", async ({ page }) => {
        await page.goto("/dashboard/provoz");
        await expect(page.getByRole("heading", { name: "Provozní výdaje" })).toBeVisible();

        await page.getByRole("button", { name: "Nový provozní výdaj" }).click();
        await page.getByLabel("Název *").fill("E2E oprava vleku");
        await page.getByRole("button", { name: "Založit" }).click();

        // Po založení přesměruje na detail v režimu provozního výdaje
        await expect(page).toHaveURL(/\/dashboard\/events\/\d+/);
        await expect(page.getByRole("heading", { name: "E2E oprava vleku" })).toBeVisible();
        await expect(page.getByRole("tab", { name: "Náklady" })).toBeVisible();
        await expect(page.getByRole("tab", { name: "Přihlášky" })).toHaveCount(0);

        // Nezobrazuje se v kalendáři akcí
        await page.goto(`/dashboard/events?year=${new Date().getFullYear()}`);
        await expect(page.getByText("E2E oprava vleku")).toHaveCount(0);

        // Zobrazuje se v seznamu Provozu
        await page.goto("/dashboard/provoz");
        await expect(page.getByText("E2E oprava vleku").first()).toBeVisible();
    });

    test("ne-hospodář je z /dashboard/provoz přesměrován", async ({ browser, baseURL }) => {
        const secret = process.env.AUTH_SECRET;
        if (!secret) throw new Error("AUTH_SECRET musí být nastaven");
        const token = await encode({
            token: { name: "E2E Ne-hospodář", email: "e2e-nehospodar@test.local", sub: "e2e-nehospodar" },
            secret,
            salt: "authjs.session-token",
            maxAge: 3600,
        });
        const context = await browser.newContext();
        await context.addCookies([{
            name: "authjs.session-token",
            value: token,
            domain: new URL(baseURL!).hostname,
            path: "/",
            httpOnly: true,
            secure: false,
            sameSite: "Lax",
        }]);
        const page = await context.newPage();
        await page.goto("/dashboard/provoz");
        await expect(page).toHaveURL(/\/dashboard$/);
        await context.close();
    });
});
