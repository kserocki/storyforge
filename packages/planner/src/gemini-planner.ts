import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { type ShotPlan, ShotPlanSchema } from "@storyforge/shared";
import { generateText, type LanguageModel, Output } from "ai";
import type { ShotPlanner } from "./planner.js";

export const PLANNER_INSTRUCTIONS = `You are a storyboard artist for short video ads.
Split the brief into 2-6 shots that together tell one coherent story with a consistent look:
the same product, characters, color palette and setting style in every shot.
Rules for every shot prompt (they go straight to an image-to-video model):
- describe only what the camera sees: subject, action, setting, lighting, mood;
- never ask for on-screen text, captions, logos or brand names;
- never write meta instructions such as "create a prompt for";
- keep each prompt self-contained (the video model doesn't see the other shots).
Durations are 5 or 10 seconds; the total should match the length requested in the brief (default 20 s).`;

export class LlmShotPlanner implements ShotPlanner {
    constructor(private readonly model: LanguageModel) {}

    async plan(brief: string, signal?: AbortSignal): Promise<ShotPlan> {
        const { output } = await generateText({
            model: this.model,
            instructions: PLANNER_INSTRUCTIONS,
            prompt: `Brief: ${brief}`,
            output: Output.object({ schema: ShotPlanSchema, name: "shot_plan" }),
            abortSignal: signal,
        });
        return output;
    }
}

export function createGeminiModel(apiKey: string, modelId = "gemini-flash-latest"): LanguageModel {
    return createGoogleGenerativeAI({ apiKey })(modelId);
}
