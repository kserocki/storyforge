export type TaskStatus = "PENDING" | "THROTTLED" | "RUNNING" | "SUCCEEDED" | "FAILED" | "CANCELED";

export function isTerminalTask(status: TaskStatus): boolean {
    switch (status) {
        case "PENDING":
        case "THROTTLED":
        case "RUNNING":
            return false;
        case "SUCCEEDED":
        case "FAILED":
        case "CANCELED":
            return true;
    }
}

const statuses: TaskStatus[] = ["PENDING", "RUNNING", "SUCCEEDED"];
for (const status of statuses) {
    console.log(status, isTerminalTask(status));
}