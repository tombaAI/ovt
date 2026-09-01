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

test.describe("provozní výdaje — druhý oddíl (TOM)", () => {
    async function tomContext(browser: import("@playwright/test").Browser, baseURL: string | undefined) {
        const secret = process.env.AUTH_SECRET;
        if (!secret) throw new Error("AUTH_SECRET musí být nastaven");
        const token = await encode({
            token: { name: "E2E Hospodářka TOM", email: "e2e-tom@test.local", sub: "e2e-tom" },
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
        return context;
    }

    test("hospodářka TOM založí výdaj pro TOM; hospodář OVT ho vidí, ale nesmí uzamknout ani odeslat", async ({ browser, baseURL, page }) => {
        const tomCtx = await tomContext(browser, baseURL);
        const tomPage = await tomCtx.newPage();

        await tomPage.goto("/dashboard/provoz");
        await expect(tomPage.getByRole("heading", { name: "Provozní výdaje" })).toBeVisible();
        await expect(tomPage.getByRole("tab", { name: "OVT" })).toBeVisible();
        await tomPage.getByRole("tab", { name: "TOM" }).click();

        await tomPage.getByRole("button", { name: "Nový provozní výdaj" }).click();
        await tomPage.getByLabel("Název *").fill("E2E výdaj TOM");
        await tomPage.getByRole("button", { name: "Založit" }).click();

        await expect(tomPage).toHaveURL(/\/dashboard\/events\/\d+/);
        const eventUrl = tomPage.url();

        // Hospodář OVT (výchozí přihlášená session) vidí detail cizího oddílu…
        await page.goto(eventUrl);
        await expect(page.getByRole("heading", { name: "E2E výdaj TOM" })).toBeVisible();
        await expect(page.getByText("TOM", { exact: true }).first()).toBeVisible();

        // …ale uzamčení je vyhrazené hospodářce TOM.
        await page.getByRole("tab", { name: "Náklady" }).click();
        await page.getByRole("button", { name: "Uzamknout částky" }).click();
        await expect(page.getByText(/může uzamknout jen jeho hospodář/)).toBeVisible();

        // Hospodářka TOM ale uzamknout smí — přejde do stavu "prescribed" (u provozního výdaje
        // s tím automaticky i souhlas hospodáře, viz lockBilling).
        await tomPage.getByRole("tab", { name: "Náklady" }).click();
        await tomPage.getByRole("button", { name: "Uzamknout částky" }).click();
        await expect(tomPage.getByText(/Částky jsou uzamčeny/)).toBeVisible();
        await tomCtx.close();

        // Po uzamčení hospodářkou TOM je "Odeslat vyúčtování" viditelné i hospodáři OVT (jde
        // o cizí oddíl), ale zablokované — odeslat smí jen hospodář vlastnícího oddílu (Fix 1c/1d).
        await page.reload();
        await page.getByRole("tab", { name: "Náklady" }).click();
        await expect(page.getByText(/Částky jsou uzamčeny/)).toBeVisible();
        await expect(page.getByText("Odeslat smí jen hospodář tohoto oddílu.")).toBeVisible();
        await expect(page.getByRole("button", { name: "Odeslat vyúčtování" })).toBeDisabled();
    });

    test("hospodář OVT NESMÍ založit provozní výdaj pro oddíl TOM (založení je jen pro hospodáře vlastního oddílu)", async ({ page }) => {
        await page.goto("/dashboard/provoz");
        await expect(page.getByRole("heading", { name: "Provozní výdaje" })).toBeVisible();
        await page.getByRole("tab", { name: "TOM" }).click();

        await page.getByRole("button", { name: "Nový provozní výdaj" }).click();
        await expect(page.locator("#provoz-oddil")).toHaveValue("tom");
        await page.getByLabel("Název *").fill("E2E výdaj TOM od OVT — má selhat");
        await page.getByRole("button", { name: "Založit" }).click();

        // Založení je odmítnuto — dialog zůstává otevřený, žádný redirect na detail výdaje
        await expect(page.getByText(/může založit jen jeho hospodář/)).toBeVisible();
        await expect(page).not.toHaveURL(/\/dashboard\/events\/\d+/);
    });
});
