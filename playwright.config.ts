import { defineConfig, devices } from "@playwright/test";

// E2E smoke testy — viz zadani/2026-07-06-automaticke-testy.md a e2e/README.md.
// Vyžadují DATABASE_URL na TESTOVACÍ databázi (nikdy staging/produkce) a AUTH_SECRET
// shodný s testovaným serverem — auth.setup.ts z něj podepisuje session cookie.

const PORT = process.env.E2E_PORT ?? "3100";
const baseURL = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`;

export default defineConfig({
    testDir: "./e2e",
    fullyParallel: true,
    forbidOnly: Boolean(process.env.CI),
    retries: process.env.CI ? 1 : 0,
    reporter: process.env.CI ? [["github"], ["list"]] : [["list"]],
    use: {
        baseURL,
        trace: "on-first-retry",
    },
    projects: [
        { name: "setup", testMatch: /auth\.setup\.ts/ },
        {
            name: "chromium",
            use: { ...devices["Desktop Chrome"], storageState: "e2e/.auth/session.json" },
            dependencies: ["setup"],
        },
    ],
    webServer: {
        // CI testuje produkční build (build proběhl v předchozím kroku workflow),
        // lokálně stačí dev server.
        command: process.env.CI ? `npm run start -- -p ${PORT}` : `npm run dev -- -p ${PORT}`,
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
    },
});
