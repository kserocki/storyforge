export class RunwayApiError extends Error {
    constructor(
        readonly status: number,
        readonly body: string,
    ) {
        super(`Runway API error ${status}: ${body.slice(0, 200)}`);
        this.name = "RunwayApiError";
    }

    get retryable(): boolean {
        return this.status === 429 || (this.status >= 502 && this.status <= 504);
    }
}
