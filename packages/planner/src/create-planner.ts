import type { ShotPlanner } from "./planner.js";
import { FakeShotPlanner } from "./fake-planner.js";
import { createGeminiModel, LlmShotPlanner } from "./gemini-planner.js";

export interface PlannerConfig {
    PLANNER: "fake" | "gemini";
    GEMINI_API_KEY?: string | undefined;
    GEMINI_MODEL?: string | undefined;
}

export function createPlanner(config: PlannerConfig): ShotPlanner {
    if (config.PLANNER === "fake") return new FakeShotPlanner();
    if (!config.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is required when PLANNER=gemini");
    return new LlmShotPlanner(createGeminiModel(config.GEMINI_API_KEY, config.GEMINI_MODEL));
}
