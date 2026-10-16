import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        globalSetup: ["./vitest.global-setup.ts"],
        // All test files share one database, so run them one after another.
        fileParallelism: false,
    },
});
