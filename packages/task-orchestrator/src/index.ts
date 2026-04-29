import { randomUUID } from "node:crypto";
import type { Logger } from "@autobs/logger";
import type { Db } from "@autobs/storage";
import type { TaskStatus, TaskItemStatus } from "@autobs/core";

export type CreateTaskInput = {
  projectId: string;
  pageIds: string[];
};

export type TaskItemRunner = (input: { taskId: string; taskItemId: string; pageId: string }) => Promise<void>;

export type TaskOrchestrator = {
  start: () => Promise<void>;
  stop: () => Promise<void>;
  createTask: (input: CreateTaskInput) => Promise<{ taskId: string }>;
  setTaskStatus: (input: { taskId: string; status: TaskStatus }) => Promise<void>;
};

export type TaskOrchestratorOptions = {
  db: Db;
  logger: Logger;
  runTaskItem?: TaskItemRunner;
  pollIntervalMs?: number;
};

function computeProgress(db: Db, taskId: string): number {
  const total = db.raw
    .prepare("SELECT COUNT(1) AS c FROM task_items WHERE task_id = ?")
    .get(taskId) as any;
  const done = db.raw
    .prepare("SELECT COUNT(1) AS c FROM task_items WHERE task_id = ? AND status IN ('completed','failed')")
    .get(taskId) as any;

  const totalCount = Number(total?.c ?? 0);
  if (totalCount === 0) return 0;
  return Math.min(1, Math.max(0, Number(done?.c ?? 0) / totalCount));
}

function normalizeRunningToPending(db: Db) {
  db.raw.exec("UPDATE task_items SET status = 'pending' WHERE status = 'running'");
}

function finalizeCompletedTasks(db: Db) {
  const rows = db.raw
    .prepare(
      `
      SELECT t.id AS task_id
      FROM tasks t
      WHERE t.status = 'running'
        AND NOT EXISTS (
          SELECT 1 FROM task_items i
          WHERE i.task_id = t.id
            AND i.status IN ('pending','running')
        )
    `
    )
    .all() as any[];

  const setCompleted = db.raw.prepare(
    "UPDATE tasks SET status = 'completed', progress = 1, completed_at = datetime('now') WHERE id = ?"
  );

  db.raw.exec("BEGIN");
  try {
    for (const r of rows) {
      setCompleted.run(r.task_id);
    }
    db.raw.exec("COMMIT");
  } catch (e) {
    db.raw.exec("ROLLBACK");
    throw e;
  }
}

function getNextPendingItem(
  db: Db
): { taskId: string; taskItemId: string; pageId: string } | undefined {
  const row = db.raw
    .prepare(
      `
      SELECT i.id AS task_item_id, i.task_id AS task_id, i.page_id AS page_id
      FROM task_items i
      JOIN tasks t ON t.id = i.task_id
      WHERE i.status = 'pending'
        AND t.status = 'running'
      ORDER BY i.id
      LIMIT 1
    `
    )
    .get() as any;

  if (!row) return undefined;
  return { taskId: row.task_id, taskItemId: row.task_item_id, pageId: row.page_id };
}

function setTaskItemStatus(db: Db, taskItemId: string, status: TaskItemStatus) {
  db.raw.prepare("UPDATE task_items SET status = ? WHERE id = ?").run(status, taskItemId);
}

function updateTaskProgress(db: Db, taskId: string) {
  const progress = computeProgress(db, taskId);
  db.raw.prepare("UPDATE tasks SET progress = ? WHERE id = ?").run(progress, taskId);
}

export function createTaskOrchestrator(options: TaskOrchestratorOptions): TaskOrchestrator {
  const pollIntervalMs = options.pollIntervalMs ?? 200;
  const runTaskItem: TaskItemRunner =
    options.runTaskItem ??
    (async () => {
      return;
    });

  let stopped = true;
  let timer: NodeJS.Timeout | undefined;

  async function tick() {
    if (stopped) return;

    const next = getNextPendingItem(options.db);
    if (!next) {
      finalizeCompletedTasks(options.db);
      return;
    }

    options.db.raw.exec("BEGIN");
    try {
      setTaskItemStatus(options.db, next.taskItemId, "running");
      options.db.raw.exec("COMMIT");
    } catch (e) {
      options.db.raw.exec("ROLLBACK");
      throw e;
    }

    try {
      await runTaskItem(next);
      options.db.raw.exec("BEGIN");
      try {
        setTaskItemStatus(options.db, next.taskItemId, "completed");
        updateTaskProgress(options.db, next.taskId);
        options.db.raw.exec("COMMIT");
      } catch (e) {
        options.db.raw.exec("ROLLBACK");
        throw e;
      }
    } catch (e) {
      options.logger.error({ err: String(e), taskItemId: next.taskItemId }, "task_item_failed");
      options.db.raw.exec("BEGIN");
      try {
        setTaskItemStatus(options.db, next.taskItemId, "failed");
        updateTaskProgress(options.db, next.taskId);
        options.db.raw.exec("COMMIT");
      } catch (e2) {
        options.db.raw.exec("ROLLBACK");
        throw e2;
      }
    }
  }

  function schedule() {
    if (stopped) return;
    timer = setTimeout(async () => {
      try {
        await tick();
      } finally {
        schedule();
      }
    }, pollIntervalMs);
  }

  return {
    async start() {
      if (!stopped) return;
      stopped = false;
      normalizeRunningToPending(options.db);
      schedule();
    },
    async stop() {
      stopped = true;
      if (timer) clearTimeout(timer);
      timer = undefined;
    },
    async createTask(input: CreateTaskInput) {
      const taskId = randomUUID();

      const insertTask = options.db.raw.prepare(
        "INSERT INTO tasks (id, project_id, status, progress, created_at) VALUES (?, ?, 'running', 0, datetime('now'))"
      );
      const insertItem = options.db.raw.prepare(
        "INSERT INTO task_items (id, task_id, page_id, status, retry_count) VALUES (?, ?, ?, 'pending', 0)"
      );

      options.db.raw.exec("BEGIN");
      try {
        insertTask.run(taskId, input.projectId);
        for (const pageId of input.pageIds) {
          insertItem.run(randomUUID(), taskId, pageId);
        }
        options.db.raw.exec("COMMIT");
      } catch (e) {
        options.db.raw.exec("ROLLBACK");
        throw e;
      }

      return { taskId };
    },
    async setTaskStatus(input: { taskId: string; status: TaskStatus }) {
      options.db.raw
        .prepare("UPDATE tasks SET status = ?, completed_at = CASE WHEN ?='completed' THEN datetime('now') ELSE completed_at END WHERE id = ?")
        .run(input.status, input.status, input.taskId);
    }
  };
}
