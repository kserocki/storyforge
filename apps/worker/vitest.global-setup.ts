import { prepareTestDatabase } from "@storyforge/db/testing";

export default async function setup(): Promise<void> {
    await prepareTestDatabase();
}
