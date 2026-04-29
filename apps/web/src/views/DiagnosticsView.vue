<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";
import { api } from "../lib/api";
import { useAppStore } from "../stores/app";

const store = useAppStore();
const tasks = ref<Array<{ id: string; status: string; progress: number }>>([]);
const connected = ref(false);
const error = ref("");
let es: EventSource | null = null;

onMounted(async () => {
  await store.loadHealth();
  await store.loadProjects();

  es = new EventSource("/api/events");
  es.onopen = () => {
    connected.value = true;
    error.value = "";
  };
  es.onerror = () => {
    connected.value = false;
    error.value = "disconnected";
  };
  es.addEventListener("snapshot", (ev) => {
    try {
      const data = JSON.parse((ev as MessageEvent).data);
      if (Array.isArray(data?.tasks)) tasks.value = data.tasks;
    } catch {}
  });
});

onBeforeUnmount(() => {
  if (es) es.close();
  es = null;
});

const secrets = ref<{ mode: string; providers: Record<string, string | null> } | null>(null);
onMounted(async () => {
  secrets.value = await api.getSecrets();
});
</script>

<template>
  <div class="page-title">
    <div>
      <h2>Diagnostics</h2>
      <p>运行态：健康检查 / SSE / 最近任务</p>
    </div>
    <span :class="connected ? 'pill ok' : 'pill warn'">{{ connected ? "events: on" : "events: off" }}</span>
  </div>

  <div class="grid">
    <div class="card">
      <div style="display: flex; align-items: center; justify-content: space-between">
        <div style="font-family: var(--mono); font-size: 12px; color: var(--muted)">Server</div>
        <span :class="store.healthOk ? 'pill ok' : 'pill bad'">{{ store.healthOk ? "health: ok" : "health: bad" }}</span>
      </div>
      <div v-if="error" style="margin-top: 10px; font-family: var(--mono); font-size: 12px; color: var(--muted)">
        {{ error }}
      </div>
    </div>

    <div class="card">
      <div style="display: flex; align-items: center; justify-content: space-between">
        <div style="font-family: var(--mono); font-size: 12px; color: var(--muted)">Workspace</div>
        <span class="pill">{{ store.projects.length }} projects</span>
      </div>
      <div style="margin-top: 10px; display: grid; gap: 10px">
        <div class="pill">secrets: {{ secrets?.mode ?? "-" }}</div>
      </div>
    </div>

    <div class="card">
      <div style="display: flex; align-items: center; justify-content: space-between">
        <div style="font-family: var(--mono); font-size: 12px; color: var(--muted)">Recent Tasks</div>
        <span class="pill">{{ tasks.length }} items</span>
      </div>

      <table class="table" style="margin-top: 12px">
        <thead>
          <tr>
            <th>Task</th>
            <th>Status</th>
            <th>Progress</th>
            <th style="width: 120px">Action</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="t in tasks" :key="t.id">
            <td style="color: var(--muted)">{{ t.id.slice(0, 8) }}</td>
            <td>
              <span :class="t.status === 'completed' ? 'pill ok' : t.status === 'running' ? 'pill warn' : 'pill'">
                {{ t.status }}
              </span>
            </td>
            <td style="font-family: var(--mono); color: var(--muted)">{{ Math.round((t.progress ?? 0) * 100) }}%</td>
            <td>
              <button class="btn" @click="store.loadTask(t.id)">Open</button>
            </td>
          </tr>
          <tr v-if="tasks.length === 0">
            <td colspan="4" style="color: var(--muted)">No tasks</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

