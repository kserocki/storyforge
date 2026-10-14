import * as path from "node:path";
import { createDb, jobs, shots, storyboards } from "../src/index.js";
import { asc, eq } from "drizzle-orm";

process.loadEnvFile(path.resolve(import.meta.dirname, "../../..", ".env"))
const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set")

const { db, close } = createDb(url);

try {
    // All or nothing: a throw anywhere inside rolls back every insert.
    const storyboardId = await db.transaction(async (tx) => {
        const [sb] = await tx
            .insert(storyboards)
            .values({ brief: "30-second teaser: a lighthouse keeper discovers the sea glowing at night" })
            .returning();

        if (!sb) throw new Error("storyboard insert returned nothing");

        const insertedShots = await tx
            .insert(shots)
            .values([
                { storyboardId: sb.id, position: 1, prompt: "Wide shot of a lonely lighthouse at dusk", durationS: 5 },
                { storyboardId: sb.id, position: 2, prompt: "Keeper climbs the spiral stairs, lantern in hand", durationS: 5 },
                { storyboardId: sb.id, position: 3, prompt: "The sea below glows electric blue, slow dolly-in", durationS: 10 },
            ])
            .returning();

        await tx
            .insert(jobs)
            .values(insertedShots.map((shot) => ({ storyboardId: sb.id, shotId: shot.id, kind: "keyframe" as const })))

        // throw new Error("Rollback should happen");
        return sb.id;
    })

    const [sb] = await db.select().from(storyboards).where(eq(storyboards.id, storyboardId));
    const rows = await db
        .select({ shot: shots, job: jobs })
        .from(shots)
        .leftJoin(jobs, eq(jobs.shotId, shots.id))
        .where(eq(shots.storyboardId, storyboardId))
        .orderBy(asc(shots.position));

    console.log(`Storyboard ${sb!.id}`);
    console.log(`--- brief: ${sb!.brief}`)
    for (const { shot, job} of rows) {
        console.log(`--- #${shot.position} (${shot.durationS}s) ${shot.prompt}  [${job?.kind}: ${job?.status}]`);
    }
} finally {
    await close();
}