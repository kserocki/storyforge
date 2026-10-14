import { prepareTestDatabase } from "./src/testing/index.js";

export default async function setup(): Promise<void> {
    await prepareTestDatabase();
}
