export type Project = {
  id: string;
  name: string;
  baseUrl: string;
  createdAt?: string;
};

export type Page = {
  id: string;
  url: string;
  contentHash?: string | null;
  screenshotPath?: string | null;
};

export type Task = {
  id: string;
  projectId: string;
  status: string;
  progress: number;
  createdAt?: string;
  completedAt?: string | null;
};

export type TaskItem = {
  id: string;
  pageId: string;
  status: string;
  retryCount: number;
  result: string | null;
  screenshotUrl?: string | null;
};

async function request<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const res = await fetch(input, init);
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`${res.status}:${txt}`);
  }
  return (await res.json()) as T;
}

export const api = {
  health: () => request<{ ok: boolean }>("/health"),

  listProjects: () => request<{ projects: Project[] }>("/api/projects"),
  createProject: (input: { name: string; baseUrl: string }) =>
    request<{ id: string }>("/api/projects", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input)
    }),
  getProject: (projectId: string) =>
    request<{ project: Project | null; pages: Page[] }>(`/api/projects/${projectId}`),
  updateProject: (projectId: string, input: { name: string; baseUrl: string }) =>
    request<{ ok: boolean }>(`/api/projects/${projectId}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input)
    }),
  addPage: (projectId: string, input: { url: string }) =>
    request<{ id: string }>(`/api/projects/${projectId}/pages`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input)
    }),

  createTask: (projectId: string, input?: { pageIds?: string[] }) =>
    request<{ taskId: string }>(`/api/projects/${projectId}/tasks`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input ?? {})
    }),
  getTask: (taskId: string) => request<{ task: Task; items: TaskItem[] }>(`/api/tasks/${taskId}`),
  pauseTask: (taskId: string) => request<{ ok: boolean }>(`/api/tasks/${taskId}/pause`, { method: "POST" }),
  resumeTask: (taskId: string) => request<{ ok: boolean }>(`/api/tasks/${taskId}/resume`, { method: "POST" }),
  cancelTask: (taskId: string) => request<{ ok: boolean }>(`/api/tasks/${taskId}/cancel`, { method: "POST" }),

  getSecrets: () => request<{ mode: string; providers: Record<string, string | null> }>("/api/secrets")
};

