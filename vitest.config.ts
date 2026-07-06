import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

// Unit testy čistých funkcí (bez DB/Next.js) — viz zadani/ZADANI_AUTOMATICKE_TESTY.md.
// E2E testy mají vlastní runner (Playwright, playwright.config.ts) a sem nepatří.
export default defineConfig({
    plugins: [tsconfigPaths()],
    test: {
        environment: "node",
        include: ["src/**/*.test.ts"],
    },
});
