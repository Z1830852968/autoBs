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

function statusText(st: string) {
  if (st === "completed") return "已完成";
  if (st === "running") return "运行中";
  if (st === "pending") return "排队中";
  if (st === "paused") return "已暂停";
  if (st === "failed") return "失败";
  if (st === "cancelled") return "已取消";
  return st;
}
</script>

<template>
  <div class="grid">
    <div class="card">
      <div class="card-title">
        <div>
          <div class="card-h">诊断面板</div>
          <div class="muted small">用于确认服务健康、事件流连接、最近任务是否在正常刷新。</div>
        </div>
        <span :class="connected ? 'pill pill-ok' : 'pill pill-warn'">{{ connected ? "事件流已连接" : "事件流未连接" }}</span>
      </div>
    </div>

    <div class="grid-2">
      <div class="card">
        <div class="card-title">
          <div>
            <div class="card-h">服务健康</div>
            <div class="muted small">后端 /health 与 SSE 状态。</div>
          </div>
          <span :class="store.healthOk ? 'pill pill-ok' : 'pill pill-bad'">{{ store.healthOk ? "健康" : "异常" }}</span>
        </div>
        <div v-if="error" class="muted mono small" style="margin-top: 10px">{{ error }}</div>
      </div>

      <div class="card">
        <div class="card-title">
          <div>
            <div class="card-h">工作区</div>
            <div class="muted small">项目数量与凭证模式。</div>
          </div>
          <span class="pill pill-soft">{{ store.projects.length }} 个项目</span>
        </div>
        <div class="grid" style="margin-top: 14px">
          <div class="pill pill-soft">secrets：<span class="mono">{{ secrets?.mode ?? "-" }}</span></div>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-title">
        <div>
          <div class="card-h">最近任务</div>
          <div class="muted small">从事件流获取最近 20 条任务快照。</div>
        </div>
        <span class="pill pill-soft">{{ tasks.length }} 条</span>
      </div>

      <table class="table" style="margin-top: 14px">
        <thead>
          <tr>
            <th>任务</th>
            <th>状态</th>
            <th>进度</th>
            <th style="width: 120px">操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="t in tasks" :key="t.id">
            <td class="muted mono">{{ t.id.slice(0, 8) }}</td>
            <td>
              <span :class="t.status === 'completed' ? 'pill pill-ok' : t.status === 'running' ? 'pill pill-warn' : 'pill'">
                {{ statusText(t.status) }}
              </span>
            </td>
            <td class="muted mono">{{ Math.round((t.progress ?? 0) * 100) }}%</td>
            <td>
              <button class="btn" @click="store.loadTask(t.id)">打开</button>
            </td>
          </tr>
          <tr v-if="tasks.length === 0">
            <td colspan="4" class="muted">暂无任务。</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
