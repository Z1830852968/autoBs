<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { api } from "../lib/api";
import { useAppStore } from "../stores/app";

const store = useAppStore();
const taskIdInput = ref("");
const selectedPageIds = ref<Record<string, boolean>>({});

const canRun = computed(() => store.selectedProjectId.length > 0 && store.pages.length > 0);
const selectedIds = computed(() => Object.entries(selectedPageIds.value).filter(([, v]) => v).map(([k]) => k));

function statusText(st: string) {
  if (st === "completed") return "已完成";
  if (st === "running") return "运行中";
  if (st === "paused") return "已暂停";
  if (st === "pending") return "排队中";
  if (st === "failed") return "失败";
  if (st === "cancelled") return "已取消";
  if (st === "idle") return "未开始";
  return st;
}

function statusBadge(st: string) {
  if (st === "completed") return "pill pill-ok";
  if (st === "running" || st === "pending") return "pill pill-warn";
  if (st === "failed" || st === "cancelled") return "pill pill-bad";
  return "pill";
}

function itemError(it: { status: string; result: string | null }): string {
  if (it.status !== "failed") return "";
  if (!it.result) return "";
  try {
    const parsed = JSON.parse(it.result);
    if (parsed && typeof parsed === "object" && "message" in parsed) return String((parsed as any).message);
    return it.result;
  } catch {
    return it.result;
  }
}

const statusPill = computed(() => {
  const st = store.task?.status ?? "idle";
  return { cls: statusBadge(st), text: statusText(st) };
});

function normalizeSelection() {
  const next: Record<string, boolean> = {};
  for (const p of store.pages) next[p.id] = selectedPageIds.value[p.id] ?? true;
  selectedPageIds.value = next;
}

async function openTask() {
  if (!taskIdInput.value) return;
  await store.loadTask(taskIdInput.value);
}

async function runTask() {
  const ids = selectedIds.value;
  const taskId = await store.createTask(ids.length > 0 ? ids : undefined);
  taskIdInput.value = taskId;
}

async function pause() {
  if (!store.selectedTaskId) return;
  await api.pauseTask(store.selectedTaskId);
  await store.loadTask(store.selectedTaskId);
}

async function resume() {
  if (!store.selectedTaskId) return;
  await api.resumeTask(store.selectedTaskId);
  await store.loadTask(store.selectedTaskId);
}

async function cancel() {
  if (!store.selectedTaskId) return;
  await api.cancelTask(store.selectedTaskId);
  await store.loadTask(store.selectedTaskId);
}

const sseConnected = ref(false);
const sseError = ref("");
let es: EventSource | null = null;

watch(
  () => store.selectedTaskId,
  (taskId) => {
    if (es) es.close();
    es = null;
    sseConnected.value = false;
    sseError.value = "";
    if (!taskId) return;

    es = new EventSource(`/api/events?taskId=${encodeURIComponent(taskId)}`);
    es.onopen = () => {
      sseConnected.value = true;
      sseError.value = "";
    };
    es.onerror = () => {
      sseConnected.value = false;
      sseError.value = "disconnected";
    };
    es.addEventListener("snapshot", (ev) => {
      const data = (ev as MessageEvent).data;
      try {
        store.applyTaskSnapshot(JSON.parse(data));
      } catch {}
    });
  },
  { immediate: true }
);

onBeforeUnmount(() => {
  if (es) es.close();
  es = null;
});

onMounted(async () => {
  await store.loadProjects();
  if (!store.selectedProjectId && store.projects[0]?.id) {
    await store.loadProject(store.projects[0].id);
  } else if (store.selectedProjectId) {
    await store.loadProject(store.selectedProjectId);
  }
  normalizeSelection();
});

watch(
  () => store.pages,
  () => normalizeSelection(),
  { deep: true }
);
</script>

<template>
  <div class="grid">
    <div class="card">
      <div class="card-title">
        <div>
          <div class="card-h">任务状态</div>
          <div class="muted small">页面选好后即可启动；启动后会自动订阅 SSE，实时刷新进度与截图。</div>
        </div>
        <span :class="statusPill.cls">{{ statusPill.text }}</span>
      </div>
    </div>

    <div v-if="store.selectedTaskId" class="card">
      <div class="card-title">
        <div>
          <div class="card-h">实时连接</div>
          <div class="muted small">SSE：用于每秒推送任务快照。</div>
        </div>
        <span :class="sseConnected ? 'pill pill-ok' : 'pill pill-warn'">{{ sseConnected ? "已连接" : "未连接" }}</span>
      </div>
      <div v-if="sseError" class="muted mono small" style="margin-top: 10px">{{ sseError }}</div>
    </div>

    <div v-if="!store.selectedProjectId" class="notice">
      <div class="card-h">还没有选择项目</div>
      <div class="muted small" style="margin-top: 6px">请先到「项目」创建/选择一个项目，并至少添加一个页面。</div>
    </div>

    <div v-else class="grid">
      <div class="grid-2">
        <div class="card">
          <div class="card-title">
            <div>
              <div class="card-h">页面选择</div>
              <div class="muted small">默认全选；也可以只跑关键页面。</div>
            </div>
            <span class="pill pill-soft">共 {{ store.pages.length }} 页</span>
          </div>

          <div class="grid" style="margin-top: 14px">
            <div v-for="p in store.pages" :key="p.id" class="toolbar" style="justify-content: space-between">
              <label class="toolbar mono small" style="gap: 10px; align-items: center; color: rgba(255, 255, 255, 0.82)">
                <input type="checkbox" v-model="selectedPageIds[p.id]" />
                <span>{{ p.url }}</span>
              </label>
              <span class="pill pill-soft">{{ p.id.slice(0, 8) }}</span>
            </div>
          </div>

          <div class="toolbar" style="margin-top: 14px">
            <button class="btn btn-primary" :disabled="!canRun" @click="runTask">启动任务</button>
            <button class="btn" :disabled="!store.selectedTaskId" @click="pause">暂停</button>
            <button class="btn" :disabled="!store.selectedTaskId" @click="resume">继续</button>
            <button class="btn btn-danger" :disabled="!store.selectedTaskId" @click="cancel">取消</button>
          </div>
        </div>

        <div class="card">
          <div class="card-title">
            <div>
              <div class="card-h">打开任务</div>
              <div class="muted small">粘贴 Task ID 可快速定位历史任务。</div>
            </div>
            <span class="pill pill-soft">进度：{{ Math.round((store.task?.progress ?? 0) * 100) }}%</span>
          </div>

          <div class="grid" style="margin-top: 14px">
            <div class="field">
              <label>任务 ID</label>
              <input v-model="taskIdInput" placeholder="例如：2c0f1f5a-..." />
            </div>
            <div class="toolbar">
              <button class="btn" @click="openTask" :disabled="!taskIdInput">打开</button>
              <button class="btn" @click="store.loadTask(store.selectedTaskId)" :disabled="!store.selectedTaskId">刷新</button>
            </div>
            <div class="progress">
              <div :style="{ width: `${Math.round((store.task?.progress ?? 0) * 100)}%` }" />
            </div>
            <div class="muted mono small">任务：{{ store.selectedTaskId ? store.selectedTaskId : "未选择" }}</div>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-title">
          <div>
            <div class="card-h">任务条目</div>
            <div class="muted small">每个页面一个条目；截图可点击放大。</div>
          </div>
          <span class="pill pill-soft">{{ store.taskItems.length }} 条</span>
        </div>

        <table class="table" style="margin-top: 14px">
          <thead>
            <tr>
              <th>页面</th>
              <th>状态</th>
              <th>截图</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="it in store.taskItems" :key="it.id">
              <td class="muted mono">{{ it.pageId.slice(0, 8) }}</td>
              <td>
                <span :class="statusBadge(it.status)">{{ statusText(it.status) }}</span>
              </td>
              <td>
                <a v-if="it.screenshotUrl" :href="it.screenshotUrl" target="_blank" rel="noreferrer">
                  <img class="thumb" :src="it.screenshotUrl" />
                </a>
                <span v-else class="pill pill-soft">暂无</span>
                <div v-if="itemError(it)" class="muted small" style="margin-top: 8px; white-space: pre-wrap">
                  失败原因：{{ itemError(it) }}
                </div>
              </td>
            </tr>
            <tr v-if="store.taskItems.length === 0">
              <td colspan="3" class="muted">暂无条目，请先启动任务。</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>
