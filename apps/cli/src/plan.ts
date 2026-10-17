import { parseArgs } from "node:util";
import { createPlanner } from "@storyforge/planner";
import { loadCliEnv } from "./env.js";

const { values } = parseArgs({ options: { brief: { type: "string" } } });
if (!values.brief) {
    console.error(`Usage: pnpm plan --brief "20-second ad for headphones, neon city at night`);
    process.exit(1);
}

const env = loadCliEnv();

try {
    const plan = await createPlanner(env).plan(values.brief);
    console.log(`Planner: ${env.PLANNER} - "${plan.title}"`);
    plan.shots.forEach((s, i) => console.log(` #${i + 1} (${s.durationS}s, ${s.camera}) ${s.prompt}`));
} catch (err) {
    console.error(`Planning failed: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
}
