import { z } from "zod";

export const PlannedShotSchema = z.object({
    prompt: z
        .string()
        .min(10)
        .max(500)
        .describe(
            "Visual description for a video model: subject, setting, lighting, mood. No on-screen text or logos.",
        ),
    camera: z.string().max(100).describe("Camera move, e.g. 'slow dolly-in', 'static wide', 'orbit left'."),
    durationS: z.union([z.literal(5), z.literal(10)]).describe("Clip length in seconds: 5 or 10."),
});

export const ShotPlanSchema = z.object({
    title: z.string().min(1).max(80).describe("Short working title for the ad"),
    shots: z.array(PlannedShotSchema).min(2).max(6),
});

export type PlannedShot = z.infer<typeof PlannedShotSchema>;
export type ShotPlan = z.infer<typeof ShotPlanSchema>;
