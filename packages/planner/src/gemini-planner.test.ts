import type { ShotPlan } from "@storyforge/shared";
import { MockLanguageModelV4 } from "ai/test";
import { describe, expect, it } from "vitest";
import { LlmShotPlanner, PLANNER_INSTRUCTIONS } from "./gemini-planner.js";

/** A fake LLM that answers every call with `text` — no network, no API key, deterministic. */
function modelAnswering(text: string) {
    return new MockLanguageModelV4({
        doGenerate: async () => ({
            content: [{ type: "text", text }],
            finishReason: { unified: "stop", raw: "STOP" },
            usage: {
                inputTokens: { total: 100, noCache: 100, cacheRead: 0, cacheWrite: 0 },
                outputTokens: { total: 50, text: 50, reasoning: 0 },
            },
            warnings: [],
        }),
    });
}

const validPlan: ShotPlan = {
    title: "Neon headphones",
    shots: [
        { prompt: "Rain-soaked neon street at night, slow push-in", camera: "slow dolly-in", durationS: 10 },
        { prompt: "Close-up of matte black headphones glowing cyan", camera: "orbit left", durationS: 5 },
        { prompt: "Rider puts headphones on, city lights blur behind", camera: "static medium", durationS: 5 },
    ],
};

describe("LlmShotPlanner", () => {
    it("returns the plan parsed from the model's JSON", async () => {
        const plan = await new LlmShotPlanner(modelAnswering(JSON.stringify(validPlan))).plan("20 s headphones ad");
        expect(plan).toEqual(validPlan);
    });

    it("sends the instructions, the brief and a JSON schema", async () => {
        const model = modelAnswering(JSON.stringify(validPlan));
        await new LlmShotPlanner(model).plan("20 s headphones ad");

        const call = model.doGenerateCalls[0]!;
        expect(JSON.stringify(call.prompt)).toContain("20 s headphones ad");
        expect(JSON.stringify(call.prompt)).toContain(PLANNER_INSTRUCTIONS.slice(0, 40));
        expect(call.responseFormat).toMatchObject({ type: "json" });
    });

    it("rejects an answer that breaks the schema (e.g. a 7-second shot)", async () => {
        const bad = { ...validPlan, shots: [{ ...validPlan.shots[0], durationS: 7 }, validPlan.shots[1]] };
        await expect(new LlmShotPlanner(modelAnswering(JSON.stringify(bad))).plan("x")).rejects.toThrow();
    });

    it("rejects an answer that is not JSON at all", async () => {
        await expect(new LlmShotPlanner(modelAnswering("Sure! Here are your shots:")).plan("x")).rejects.toThrow();
    });
});
