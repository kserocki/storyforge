import { type Shot, shots, storyboards } from "../schema.js";
import type { Db } from "../client.js";
import { eq } from "drizzle-orm";

export interface ShotWithReference {
    shot: Shot;
    referenceImageUrl: string | null;
}

export async function getShotWithReference(db: Db, shotId: string): Promise<ShotWithReference | undefined> {
    const [row] = await db
        .select({ shot: shots, referenceImageUrl: storyboards.referenceImageUrl })
        .from(shots)
        .innerJoin(storyboards, eq(storyboards.id, shots.storyboardId))
        .where(eq(shots.id, shotId));
    return row;
}

export async function setShotClipUrl(db: Db, shotId: string, clipUrl: string): Promise<void> {
    await db.update(shots).set({ clipUrl }).where(eq(shots.id, shotId));
}
