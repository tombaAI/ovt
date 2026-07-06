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
            await expect(page.getByText(probe).first()).toBeVisible();
            // Server/client error boundary se nesmí objevit
            await expect(page.getByText(/Application error|Něco se pokazilo/)).toHaveCount(0);
        });
    }

    test("detail člena (sheet) zobrazí seedovaná data", async ({ page }) => {
        await page.goto("/dashboard/members");
        await page.getByText("Jan Testovací").first().click();
        const sheet = page.getByRole("dialog");
        await expect(sheet).toBeVisible();
        await expect(sheet.getByText("Jan Testovací").first()).toBeVisible();
    });
});
