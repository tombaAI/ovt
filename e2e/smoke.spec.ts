import { expect, test } from "@playwright/test";

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
