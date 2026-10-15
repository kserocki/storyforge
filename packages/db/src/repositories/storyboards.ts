import type { Db } from "../client.js";
import { jobs, type Shot, shots, type Storyboard, storyboards } from "../schema.js";
import { asc, eq } from "drizzle-orm";

export interface NewShotInput {
    prompt: string;
    durationS: 5 | 10;
}

export interface NewStoryboardInput {
    brief: string;
    referenceImageUrl: string;
    shots: NewShotInput[];
}

export interface CreatedStoryboard {
    storyboardId: string;
    shotIds: string[];
    jobIds: string[];
}

/** Inserts a storyboard, its shots (positions 1…n) and one queued `clip` job per shot - all or nothing. */
export async function createStoryboard(db: Db, input: NewStoryboardInput): Promise<CreatedStoryboard> {
    if (input.shots.length === 0) throw new Error("A storyboard needs at least one shot");

    return db.transaction(async (tx) => {
        const [sb] = await tx
            .insert(storyboards)
            .values({ brief: input.brief, referenceImageUrl: input.referenceImageUrl })
            .returning({ id: storyboards.id });

        if (!sb) throw new Error("storyboard insert returned nothing");

        const insertedShots = await tx
            .insert(shots)
            .values(input.shots.map((s, i) => ({ storyboardId: sb.id, position: i + 1, ...s })))
            .returning({ id: shots.id });

        const insertedJobs = await tx
            .insert(jobs)
            .values(insertedShots.map((s) => ({ storyboardId: sb.id, shotId: s.id, kind: "clip" as const })))
            .returning({ id: jobs.id });

        return {
            storyboardId: sb.id,
            shotIds: insertedShots.map((s) => s.id),
            jobIds: insertedJobs.map((j) => j.id),
        };
    });
}

export async function getStoryboard(db: Db, id: string): Promise<(Storyboard & { shots: Shot[] }) | undefined> {
    const [sb] = await db.select().from(storyboards).where(eq(storyboards.id, id));
    if (!sb) return undefined;

    const rows = await db.select().from(shots).where(eq(shots.storyboardId, id)).orderBy(asc(shots.position));
    return { ...sb, shots: rows };
}
