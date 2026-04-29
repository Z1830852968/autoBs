export type TaskStatus = "idle" | "running" | "paused" | "completed" | "cancelled";

export type TaskItemStatus = "pending" | "running" | "completed" | "failed";

export class AutobsError extends Error {
  readonly code: string;
  readonly cause?: unknown;

  constructor(code: string, message: string, cause?: unknown) {
    super(message);
    this.code = code;
    this.cause = cause;
  }
}

