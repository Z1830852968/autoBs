import { defineStore } from "pinia";
import { api, type Page, type Project, type Task, type TaskItem } from "../lib/api";

export const useAppStore = defineStore("app", {
  state: () => ({
    projects: [] as Project[],
    selectedProjectId: "" as string,
    project: null as Project | null,
    pages: [] as Page[],

    selectedTaskId: "" as string,
    task: null as Task | null,
    taskItems: [] as TaskItem[],

    healthOk: null as boolean | null,
    lastError: "" as string
  }),
  actions: {
    setError(e: unknown) {
      this.lastError = e instanceof Error ? e.message : String(e);
    },
    async loadHealth() {
      try {
        const r = await api.health();
        this.healthOk = r.ok;
      } catch (e) {
        this.healthOk = false;
        this.setError(e);
      }
    },
    async loadProjects() {
      try {
        const r = await api.listProjects();
        this.projects = r.projects;
      } catch (e) {
        this.setError(e);
      }
    },
    async createProject(input: { name: string; baseUrl: string }) {
      const r = await api.createProject(input);
      await this.loadProjects();
      this.selectedProjectId = r.id;
      await this.loadProject(r.id);
      return r.id;
    },
    async loadProject(projectId: string) {
      this.selectedProjectId = projectId;
      try {
        const r = await api.getProject(projectId);
        this.project = r.project;
        this.pages = r.pages;
      } catch (e) {
        this.setError(e);
      }
    },
    async updateProject(input: { name: string; baseUrl: string }) {
      if (!this.selectedProjectId) return;
      await api.updateProject(this.selectedProjectId, input);
      await this.loadProjects();
      await this.loadProject(this.selectedProjectId);
    },
    async addPage(url: string) {
      if (!this.selectedProjectId) return;
      await api.addPage(this.selectedProjectId, { url });
      await this.loadProject(this.selectedProjectId);
    },
    async createTask(pageIds?: string[]) {
      if (!this.selectedProjectId) throw new Error("no_project_selected");
      const r = await api.createTask(this.selectedProjectId, pageIds ? { pageIds } : undefined);
      this.selectedTaskId = r.taskId;
      await this.loadTask(r.taskId);
      return r.taskId;
    },
    async loadTask(taskId: string) {
      this.selectedTaskId = taskId;
      try {
        const r = await api.getTask(taskId);
        this.task = r.task;
        this.taskItems = r.items;
      } catch (e) {
        this.setError(e);
      }
    },
    applyTaskSnapshot(payload: any) {
      if (payload?.task) this.task = payload.task;
      if (Array.isArray(payload?.items)) this.taskItems = payload.items;
    }
  }
});

