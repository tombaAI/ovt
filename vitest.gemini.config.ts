import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

// Integrační test Gemini analýzy dokladů — reálné síťové volání (Gemini API), cena,
// samostatný běh oddělený od pre-commit/unit vrstvy. Nikdy nespouštět jako součást
// npm run test:unit. Viz docs/superpowers/specs/2026-07-23-integracni-test-gemini-analyzy.md.
export default defineConfig({
    plugins: [tsconfigPaths()],
    test: {
        environment: "node",
        include: ["e2e/gemini/**/*.test.ts"],
        testTimeout: 60_000,
    },
});
