export interface BackoffOptions {
    baseMs: number;
    maxMs: number;
    jitterRatio?: number;
    random?: () => number;
}

export function computeBackoff(attempt: number, options: BackoffOptions): number {
    const { baseMs, maxMs, jitterRatio = 0.5, random = Math.random } = options;
    const delay = Math.min(maxMs, baseMs * 2 ** (attempt - 1));
    return Math.round(delay + delay * jitterRatio * random());
}
