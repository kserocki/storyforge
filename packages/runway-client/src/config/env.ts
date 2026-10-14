import { z } from "zod";

export const EnvSchema = z
    .object({
        PROVIDER: z.enum(["fake", "runway"]).default("fake"),
        // Empty string is treated as missing.
        RUNWAY_API_KEY: z
            .string()
            .optional()
            .transform((v) => v || undefined),
        RUNWAY_API_VERSION: z.string().default("2024-11-06"),
    })
    .superRefine((env, ctx) => {
        if (env.PROVIDER === "runway" && !env.RUNWAY_API_KEY) {
            ctx.addIssue({
                code: "custom",
                message: "RUNWAY_API_KEY is required when PROVIDER=runway",
                path: ["RUNWAY_API_KEY"],
            });
        }
    });

export type Env = z.infer<typeof EnvSchema>;

export function loadEnv(source: Record<string, string | undefined> = process.env): Env {
    return EnvSchema.parse(source);
}
