import { computeBackoff, type BackoffOptions } from "./backoff.js";
import { RunwayApiError } from "./errors.js";
import { sleep } from "./sleep.js";

export interface RetryOptions extends BackoffOptions {
    maxAttempts: number;
    isRetryable?: (err: unknown) => boolean;
    onRetry?: (err: unknown, atempt: number, delayMs: number) => void;
    signal?: AbortSignal;
}

export function isRetryableRunwayError(err: unknown): boolean {
    return err instanceof RunwayApiError && err.retryable;
}

export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOptions): Promise<T> {
    const isRetryable = opts.isRetryable ?? isRetryableRunwayError;
    for (let attempt = 1; ; attempt++) {
        try {
            return await fn();
        } catch (err) {
            if (attempt >= opts.maxAttempts || !isRetryable(err) || opts.signal?.aborted) throw err;
            const delayMs = computeBackoff(attempt, opts);
            opts.onRetry?.(err, attempt, delayMs);
            await sleep(delayMs, opts.signal);
        }
    }
}