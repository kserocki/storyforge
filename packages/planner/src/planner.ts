import type { ShotPlan } from "@storyforge/shared";

export interface ShotPlanner {
    plan(brief: string, signal?: AbortSignal): Promise<ShotPlan>;
}
