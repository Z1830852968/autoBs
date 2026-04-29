<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { api } from "../lib/api";
import { useAppStore } from "../stores/app";

const store = useAppStore();
const taskIdInput = ref("");
const selectedPageIds = ref<Record<string, boolean>>({});

const canRun = computed(() => store.selectedProjectId.length > 0 && store.pages.length > 0);
const selectedIds = computed(() => Object.entries(selectedPageIds.value).filter(([, v]) => v).map(([k]) => k));

const statusPill = computed(() => {
  const st = store.task?.status ?? "idle";
  if (st === "completed") return { cls: "pill ok", text: "completed" };
  if (st === "running") return { cls: "pill warn", text: "running" };
  if (st === "failed" || st === "cancelled") return { cls: "pill bad", text: st };
  return { cls: "pill", text: st };
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
  <div class="page-title">
    <div>
      <h2>Tasks</h2>
      <p>任务编排：pending → running → completed/failed</p>
    </div>
    <span :class="statusPill.cls">{{ statusPill.text }}</span>
  </div>

  <div v-if="store.selectedTaskId" class="card" style="margin-bottom: 14px">
    <div style="display: flex; align-items: center; justify-content: space-between">
      <div style="font-family: var(--mono); font-size: 12px; color: var(--muted)">Events</div>
      <span :class="sseConnected ? 'pill ok' : 'pill warn'">{{ sseConnected ? "sse: on" : "sse: off" }}</span>
    </div>
    <div v-if="sseError" style="margin-top: 10px; font-family: var(--mono); font-size: 12px; color: var(--muted)">
      {{ sseError }}
    </div>
  </div>

  <div v-if="!store.selectedProjectId" class="card">
    <div style="font-family: var(--mono); color: var(--muted); font-size: 12px">No project selected</div>
  </div>

  <div v-else class="grid">
    <div class="card">
      <div style="display: flex; align-items: center; justify-content: space-between">
        <div>
          <div style="font-family: var(--mono); font-size: 12px; color: var(--muted)">Project</div>
          <div style="margin-top: 4px; font-size: 18px">{{ store.project?.name }}</div>
        </div>
        <span class="pill">{{ store.pages.length }} pages</span>
      </div>

      <div style="margin-top: 12px; display: grid; gap: 8px">
        <div v-for="p in store.pages" :key="p.id" style="display: flex; align-items: center; justify-content: space-between">
          <label style="display: flex; gap: 10px; align-items: center; font-family: var(--mono); font-size: 12px; color: var(--muted)">
            <input type="checkbox" v-model="selectedPageIds[p.id]" />
            <span style="color: var(--text)">{{ p.url }}</span>
          </label>
          <span class="pill">{{ p.id.slice(0, 8) }}</span>
        </div>
      </div>

      <div style="display: flex; gap: 10px; margin-top: 14px; flex-wrap: wrap">
        <button class="btn primary" :disabled="!canRun" @click="runTask">Run</button>
        <button class="btn" :disabled="!store.selectedTaskId" @click="pause">Pause</button>
        <button class="btn" :disabled="!store.selectedTaskId" @click="resume">Resume</button>
        <button class="btn" :disabled="!store.selectedTaskId" @click="cancel">Cancel</button>
      </div>
    </div>

    <div class="card">
      <div class="row">
        <div class="field">
          <label>Task ID</label>
          <input v-model="taskIdInput" placeholder="paste task id" />
        </div>
        <div class="field" style="display: flex; gap: 10px; align-items: flex-end">
          <button class="btn" @click="openTask">Open</button>
          <button class="btn" @click="store.loadTask(store.selectedTaskId)" :disabled="!store.selectedTaskId">Refresh</button>
        </div>
      </div>

      <div style="display: flex; align-items: center; justify-content: space-between; margin-top: 12px">
        <div style="font-family: var(--mono); font-size: 12px; color: var(--muted)">Progress</div>
        <span class="pill">{{ Math.round((store.task?.progress ?? 0) * 100) }}%</span>
      </div>

      <div
        style="
          margin-top: 10px;
          height: 10px;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.14);
          overflow: hidden;
          background: rgba(0, 0, 0, 0.18);
        "
      >
        <div
          :style="{
            height: '100%',
            width: `${Math.round((store.task?.progress ?? 0) * 100)}%`,
            background: 'linear-gradient(90deg, rgba(124, 247, 197, 0.9), rgba(255, 211, 110, 0.9))'
          }"
        />
      </div>
    </div>

    <div class="card">
      <div style="display: flex; align-items: center; justify-content: space-between">
        <div style="font-family: var(--mono); font-size: 12px; color: var(--muted)">Items</div>
        <span class="pill">{{ store.taskItems.length }} items</span>
      </div>

      <table class="table" style="margin-top: 12px">
        <thead>
          <tr>
            <th>Page</th>
            <th>Status</th>
            <th>Screenshot</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="it in store.taskItems" :key="it.id">
            <td style="color: var(--muted)">{{ it.pageId.slice(0, 8) }}</td>
            <td>
              <span :class="it.status === 'completed' ? 'pill ok' : it.status === 'failed' ? 'pill bad' : it.status === 'running' ? 'pill warn' : 'pill'">
                {{ it.status }}
              </span>
            </td>
            <td>
              <a v-if="it.screenshotUrl" :href="it.screenshotUrl" target="_blank" rel="noreferrer">
                <img class="thumb" :src="it.screenshotUrl" />
              </a>
              <span v-else class="pill">-</span>
            </td>
          </tr>
          <tr v-if="store.taskItems.length === 0">
            <td colspan="3" style="color: var(--muted)">No items</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
