import { describe, expect, it } from "vitest";
import { Semaphore } from "./semaphore.js";

describe("Semaphore", () => {
    it("never lets more than `size` tasks run at once", async () => {
        const sem = new Semaphore(2);
        let running = 0;
        let peak = 0;

        await Promise.all(
            Array.from({ length: 6 }, async () => {
                const release = await sem.acquire();
                running++;
                peak = Math.max(peak, running);
                await new Promise((r) => setTimeout(r, 5));
                running--;
                release();
            }),
        );

        expect(peak).toBe(2);
        expect(sem.free).toBe(2);
    });

    it("serves waiters in FIFO order", async () => {
        const sem = new Semaphore(1);
        const order: number[] = [];
        const first = await sem.acquire();

        const waiting = [1, 2, 3].map((n) => sem.acquire().then((release) => (order.push(n), release())));
        first();
        await Promise.all(waiting);

        expect(order).toEqual([1, 2, 3]);
    });

    it("ignores a second release", async () => {
        const sem = new Semaphore(1);
        const release = await sem.acquire();
        release();
        release();
        expect(sem.free).toBe(1);
    });

    it("rejects an aborted waiter without leaking its permit", async () => {
        const sem = new Semaphore(1);
        const hold = await sem.acquire();
        const ac = new AbortController();

        const waiting = sem.acquire(ac.signal);
        ac.abort(new Error("shutdown"));
        await expect(waiting).rejects.toThrow("shutdown");

        hold();
        expect(sem.free).toBe(1);
    });
});
