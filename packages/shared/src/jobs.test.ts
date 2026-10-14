import { describe, expect, it } from "vitest";
import { JOB_STATUSES, JobStatusSchema } from "./jobs.js";

describe("JobStatusSchema", () => {
    it("accepts every known status", () => {
        for (const status of JOB_STATUSES) expect(JobStatusSchema.parse(status)).toBe(status);
    });

    it("rejects unknown statuses", () => {
        expect(() => JobStatusSchema.parse("done")).toThrow();
    });
});
