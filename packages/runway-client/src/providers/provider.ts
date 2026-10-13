import {Task} from "../task/task.js";

export interface ImageToVideoInput {
    promptImage: string; // url / uri
    promptText?: string;
    model?: string; // runway model
    ratio?: "1280:720" | "720:1280";
    duration?: 5 | 10;
}

export interface VideoProvider {
    startImageToVideo(input: ImageToVideoInput, signal?: AbortSignal): Promise<{ id: string }>;
    getTask(id: string, signal?: AbortSignal): Promise<Task>;
}