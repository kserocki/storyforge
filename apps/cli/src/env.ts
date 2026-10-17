import * as path from "node:path";
import { z } from "zod";

const repoRoot = path.resolve(import.meta.dirname, "../../../");

const CliEnvSchema = z.object({
    DATABASE_URL: z.string().min(1).optional(),
    PLANNER: z.enum(["fake", "gemini"]).default("fake"),
    GEMINI_API_KEY: z
        .string()
        .optional()
        .transform((v) => v || undefined),
});

export type CliEnv = z.infer<typeof CliEnvSchema>;

export function loadCliEnv(): CliEnv {
    try {
        process.loadEnvFile(path.join(repoRoot, ".env.js"));
    } catch {
        // no .env file
    }
    return CliEnvSchema.parse(process.env);
}
