import { randomUUID } from "node:crypto";

import { expect, test, type Locator, type Page } from "@playwright/test";

// Hlubší feature test (ne smoke): celá smyčka schvalování změny částky doplatku —
// vygeneruj předpisy → změň náklady → přegeneruj → objeví se návrh → potvrď.
// Zadání: docs/superpowers/specs/2026-08-03-schvalovani-zmeny-castky-predpisu.md.
//
// Rozhodovací logiku samotnou hlídají unit testy (src/lib/prescription-proposal.test.ts),
// tady jde právě o to, co unit testy pokrýt nemůžou: propojení čisté funkce s DB adaptérem
// (upsertPrescriptionAmounts), server actions (lockBilling/confirmProposedAmount) a UI.
// Proto celý scénář jede přes reálné obrazovky, ne přes seed do DB.

const MEMBER_NAME = "Jan Testovací";          // seedovaný člen (e2e/seed.mjs)
const MEMBER_EMAIL = "jan.testovaci@test.local";
// Jeden účastník, žádná záloha ani dotace → doplatek = součet nákladů.
// 900 Kč při prvním vygenerování, po přidání dalších 600 Kč přepočet na 1 500 Kč.
const EXPENSE_FIRST = { amount: "900", purpose: "E2E doprava" };
const EXPENSE_SECOND = { amount: "600", purpose: "E2E ubytování" };

// Dev server kompiluje stránky za běhu a scénář prochází čtyři záložky — výchozích 30 s nestačí.
test.setTimeout(180_000);

// Čekání na dokončený server action (zápis do DB + revalidace). Výchozích 5 s je málo,
// když testovací DB obsluhuje víc paralelních workerů naráz.
const SERVER = { timeout: 30_000 };

/** Buňka „K zaplacení" v řádku přihlášky na záložce Platby. */
function settlementCell(page: Page): Locator {
    // E-mail je jen v souhrnném řádku přihlášky (rozbalené řádky účastníků ho nemají),
    // takže filtr na něj spolehlivě vybere právě ten správný <tr>.
    // Sloupce: ⌄ | Přihláška | Osoby | Cena akce | Dotace | Záloha | K zaplacení | Stav
    return page.locator("tr").filter({ hasText: MEMBER_EMAIL }).locator("td").nth(6);
}

/** Přidá náklad přes „Přidat fakturu (bez dokladu)" — jediná cesta k nákladu bez uploadu do blobu. */
async function addExpense(page: Page, { amount, purpose }: { amount: string; purpose: string }) {
    await page.getByRole("tab", { name: "Náklady" }).click();
    await page.getByRole("button", { name: "Přidat fakturu (bez dokladu)" }).click();

    const dialog = page.getByRole("dialog");
    await dialog.getByPlaceholder("8 000").fill(amount);
    await dialog.getByPlaceholder("Např. doprava autobusem Praha–Brno").fill(purpose);
    await dialog.getByRole("button", { name: "Přidat fakturu" }).click();

    await expect(dialog).toBeHidden(SERVER);
    await expect(page.getByText(purpose).filter({ visible: true }).first()).toBeVisible(SERVER);
}

/** Vygeneruje předpisy ze záložky Platby (lockBilling) a zavře nabídku rozeslání e-mailů. */
async function generatePrescriptions(page: Page) {
    await page.getByRole("tab", { name: "Platby" }).click();
    await page.getByRole("button", { name: /Vygenerovat předpisy/ }).click();
    // Maily v testu neodesíláme — odeslaný předpis by akci přepnul do stavu „vybírá peníze",
    // kde odemknout smí jen hospodář (TREASURER_EMAIL v testu není nastaven).
    await page.getByRole("button", { name: "Přeskočit" }).click();
    await expect(page.getByText("Náklady uzamčeny — předpisy vygenerovány")).toBeVisible(SERVER);
}

/** Odemkne vyúčtování zpět do přípravy (unlockBilling). */
async function unlockBilling(page: Page) {
    await page.getByRole("tab", { name: "Platby" }).click();
    await page.getByRole("button", { name: /Odemknout a upravit/ }).click();
    await expect(page.getByRole("button", { name: /Vygenerovat předpisy/ })).toBeVisible(SERVER);
}

test.describe("schvalování změny částky doplatku", () => {
    test("přepočet po vygenerování vytvoří návrh, který lze potvrdit", async ({ page }) => {
        // Akci zakládá sám test — název musí být unikátní, aby ho šlo v kalendáři najít
        // i po opakovaných bězích nad toutéž testovací DB.
        const eventName = `E2E návrh přepočtu ${randomUUID().slice(0, 8)}`;

        await test.step("založit akci", async () => {
            await page.goto("/dashboard/events");
            await page.getByRole("button", { name: "+ Nová akce" }).click();
            await page.locator("#new-name").fill(eventName);
            await page.getByRole("button", { name: "Vytvořit akci" }).click();
            await expect(page.getByRole("dialog", { name: /Nová akce/ })).toBeHidden(SERVER);

            const row = page.getByRole("row").filter({ hasText: eventName });
            await expect(row).toBeVisible(SERVER);
            await row.click();
            await expect(page).toHaveURL(/\/dashboard\/events\/\d+/);
        });

        await test.step("přidat přihlášku seedovaného člena", async () => {
            await page.getByRole("tab", { name: "Přihlášky" }).click();
            await page.getByRole("button", { name: "+ Přidat přihlášku" }).click();

            const dialog = page.getByRole("dialog");
            await dialog.getByPlaceholder("Hledat člena OVT…").fill(MEMBER_NAME);
            await dialog.getByRole("button", { name: MEMBER_NAME }).click();
            await dialog.getByRole("button", { name: "Přidat přihlášku", exact: true }).click();

            await expect(dialog).toBeHidden(SERVER);
            await expect(page.getByText(MEMBER_NAME).filter({ visible: true }).first()).toBeVisible(SERVER);
        });

        await test.step(`přidat náklad ${EXPENSE_FIRST.amount} Kč`, async () => {
            await addExpense(page, EXPENSE_FIRST);
        });

        await test.step("první vygenerování zapíše částku přímo (žádný návrh)", async () => {
            await generatePrescriptions(page);
            // Před prvním generováním je amount = 0, není co chránit → zapisuje se rovnou.
            await expect(settlementCell(page)).toHaveText(/^900\sKč$/, SERVER);
            await expect(page.getByText(/Návrh:/)).toHaveCount(0);
        });

        await test.step(`odemknout a přidat náklad ${EXPENSE_SECOND.amount} Kč`, async () => {
            await unlockBilling(page);
            // billingStatus pro záložku Náklady přichází ze serveru (ne z klientského stavu
            // záložky Platby) — po odemčení načíst stránku znovu, jinak zůstane příjmový
            // zámek a formulář na přidání nákladu se vůbec nevykreslí.
            await page.reload();
            await addExpense(page, EXPENSE_SECOND);
        });

        await test.step("přegenerování ukáže návrh, ale platnou částku nezmění", async () => {
            await generatePrescriptions(page);

            // Souhrnný banner nad tabulkou + hromadné potvrzení
            await expect(page.getByText(/1 přihláška má navržený přepočet/)).toBeVisible(SERVER);
            await expect(page.getByRole("button", { name: "Potvrdit vše" })).toBeVisible();

            const cell = settlementCell(page);
            await expect(cell.getByText(/Návrh:/)).toBeVisible(SERVER);
            // Jádro celé funkce: „K zaplacení" pořád ukazuje STAROU potvrzenou částku…
            await expect(cell).toHaveText(/^900\sKč/);
            // …a nová je vedle ní jen jako návrh ke schválení.
            await expect(cell).toHaveText(/Návrh:\s*1\s500\sKč/);
        });

        await test.step("potvrzení návrhu přepne částku na novou", async () => {
            const cell = settlementCell(page);
            await cell.getByRole("button", { name: "potvrdit" }).click();

            await expect(cell).toHaveText(/^1\s500\sKč$/, SERVER);
            await expect(page.getByText(/Návrh:/)).toHaveCount(0);
            // Banner „N přihlášek má navržený přepočet" zmizel i s hromadným potvrzením.
            // (Hláška po generování — „Vygenerováno. 1 přihlášek má navržený přepočet ke
            // schválení." — je jen záznam o proběhlé akci a zůstává, proto se testuje tlačítko.)
            await expect(page.getByRole("button", { name: "Potvrdit vše" })).toHaveCount(0);
        });

        await test.step("opakované přegenerování beze změny žádný návrh nevytvoří", async () => {
            // Regrese: nezaokrouhlené porovnání částek kdysi vyrábělo návrh donekonečna
            // (viz round2 v src/lib/prescription-proposal.ts).
            await unlockBilling(page);
            await generatePrescriptions(page);

            await expect(settlementCell(page)).toHaveText(/^1\s500\sKč$/, SERVER);
            await expect(page.getByText(/Návrh:/)).toHaveCount(0);
            await expect(page.getByRole("button", { name: "Potvrdit vše" })).toHaveCount(0);
        });
    });
});
