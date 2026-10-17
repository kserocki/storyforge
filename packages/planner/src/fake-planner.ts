import type { ShotPlanner } from "./planner.js";
import { type ShotPlan, ShotPlanSchema } from "@storyforge/shared";

const BEATS = [
    { beat: "establishing wide shot that sets the scene", camera: "slow dolly-in", durationS: 10 },
    { beat: "close-up on the main subject in action", camera: "orbit left", durationS: 5 },
    { beat: "closing hero shot, subject centered, calm ending", camera: "static wide", durationS: 5 },
] as const;

export class FakeShotPlanner implements ShotPlanner {
    async plan(brief: string): Promise<ShotPlan> {
        const subject = brief.trim().slice(0, 300) || "a product";
        return ShotPlanSchema.parse({
            title: subject.slice(0, 80),
            shots: BEATS.map(({ beat, camera, durationS }) => ({ prompt: `${subject} - ${beat}`, camera, durationS })),
        });
    }
}
