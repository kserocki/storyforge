export class Semaphore {
    private available: number;
    private readonly waiters: Array<() => void> = [];

    constructor(readonly size: number) {
        if (!Number.isInteger(size) || size < 1) throw new Error("Semaphore size must be a positive integer");
        this.available = size;
    }

    get free(): number {
        return this.available;
    }

    /** Resolves with a release function once a permit is free. Calling release twice is a no-op */
    async acquire(signal?: AbortSignal): Promise<() => void> {
        signal?.throwIfAborted();
        if (this.available > 0) {
            this.available--;
        } else {
            await new Promise<void>((resolve, reject) => {
                const waiter = () => {
                    signal?.removeEventListener("abort", onAbort);
                    resolve();
                };
                const onAbort = () => {
                    this.waiters.splice(this.waiters.indexOf(waiter), 1);
                    reject(signal!.reason);
                };
                this.waiters.push(waiter);
                signal?.addEventListener("abort", onAbort, { once: true });
            });
        }

        let released = false;
        return () => {
            if (released) return;
            released = true;
            const next = this.waiters.shift();
            // Hand the permit straight to the next waiter; only return it to the pool when nobody waits
            if (next) next();
            else this.available++;
        };
    }
}
