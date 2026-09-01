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

    test("hospodářka TOM založí výdaj pro TOM; hospodář OVT (superhospodář) ho smí uzamknout i odeslat", async ({ browser, baseURL, page }) => {
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
        await tomCtx.close();

        // Hospodář OVT je nad oběma oddíly "superhospodář" (rozhodnutí 2026-09-02) — vidí
        // cizí oddíl a smí ho i uzamknout, ne jen prohlížet.
        await page.goto(eventUrl);
        await expect(page.getByRole("heading", { name: "E2E výdaj TOM" })).toBeVisible();
        await expect(page.getByText("TOM", { exact: true }).first()).toBeVisible();

        await page.getByRole("tab", { name: "Náklady" }).click();
        await page.getByRole("button", { name: "Uzamknout částky" }).click();
        await expect(page.getByText(/Částky jsou uzamčeny/)).toBeVisible();

        // "Odeslat" zůstává disabled (výdaj nemá žádné doklady), ale ne kvůli oddílové bráně —
        // ta hospodáře OVT od tohoto rozhodnutí pouští i do cizího oddílu.
        await expect(page.getByText("Odeslat smí jen hospodář tohoto oddílu.")).toHaveCount(0);
    });

    test("hospodářka TOM nesmí zasahovat do provozních výdajů OVT — asymetrie superhospodáře", async ({ browser, baseURL, page }) => {
        // Hospodář OVT založí vlastní (OVT) provozní výdaj.
        await page.goto("/dashboard/provoz");
        await page.getByRole("button", { name: "Nový provozní výdaj" }).click();
        await expect(page.locator("#provoz-oddil")).toHaveValue("ovt");
        await page.getByLabel("Název *").fill("E2E výdaj OVT — chráněný před TOM");
        await page.getByRole("button", { name: "Založit" }).click();
        await expect(page).toHaveURL(/\/dashboard\/events\/\d+/);
        const eventUrl = page.url();

        const tomCtx = await tomContext(browser, baseURL);
        const tomPage = await tomCtx.newPage();

        // TOM nesmí založit nový výdaj pro OVT (výchozí aktivní záložka na /dashboard/provoz je OVT)…
        await tomPage.goto("/dashboard/provoz");
        await tomPage.getByRole("button", { name: "Nový provozní výdaj" }).click();
        await expect(tomPage.locator("#provoz-oddil")).toHaveValue("ovt");
        await tomPage.getByLabel("Název *").fill("E2E výdaj OVT od TOM — má selhat");
        await tomPage.getByRole("button", { name: "Založit" }).click();
        await expect(tomPage.getByText(/může založit jen jeho hospodář/)).toBeVisible();
        await expect(tomPage).not.toHaveURL(/\/dashboard\/events\/\d+/);

        // …ani uzamknout existující OVT výdaj hospodáře OVT.
        await tomPage.goto(eventUrl);
        await tomPage.getByRole("tab", { name: "Náklady" }).click();
        await tomPage.getByRole("button", { name: "Uzamknout částky" }).click();
        await expect(tomPage.getByText(/může uzamknout jen jeho hospodář/)).toBeVisible();
        await tomCtx.close();
    });
});
