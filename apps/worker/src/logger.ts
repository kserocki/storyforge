export type Logger = (event: string, fields?: Record<string, unknown>) => void;

export function createLogger(base: Record<string, unknown> = {}, write = (line: string) => console.log(line)): Logger {
    return (event, fields = {}) => write(JSON.stringify({ time: new Date().toISOString(), event, ...base, ...fields }));
}
