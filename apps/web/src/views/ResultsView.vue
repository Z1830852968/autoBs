<script setup lang="ts">
import { computed } from "vue";
import { useAppStore } from "../stores/app";

const store = useAppStore();

function statusText(st: string) {
  if (st === "completed") return "已完成";
  if (st === "running") return "运行中";
  if (st === "pending") return "排队中";
  if (st === "paused") return "已暂停";
  if (st === "failed") return "失败";
  if (st === "cancelled") return "已取消";
  return st;
}

const rows = computed(() =>
  store.taskItems.map((it) => {
    let parsed: unknown = null;
    try {
      parsed = it.result ? JSON.parse(it.result) : null;
    } catch {
      parsed = it.result;
    }
    return { ...it, parsed };
  })
);
</script>

<template>
  <div class="grid">
    <div class="card">
      <div class="card-title">
        <div>
          <div class="card-h">结果概览</div>
          <div class="muted small">这里展示每个页面条目的截图与流水线输出（JSON）。</div>
        </div>
        <span class="pill pill-soft">任务：{{ store.selectedTaskId ? store.selectedTaskId.slice(0, 8) : "未选择" }}</span>
      </div>
    </div>

    <div v-if="!store.selectedTaskId" class="notice">
      <div class="card-h">还没有选中任务</div>
      <div class="muted small" style="margin-top: 6px">请到「任务」启动或打开一个任务。</div>
    </div>

    <div v-else class="card">
      <table class="table">
        <thead>
          <tr>
            <th>条目</th>
            <th>状态</th>
            <th>截图</th>
            <th>流水线输出</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="it in rows" :key="it.id">
            <td class="muted mono">{{ it.id.slice(0, 8) }}</td>
            <td>
              <span
                :class="
                  it.status === 'completed'
                    ? 'pill pill-ok'
                    : it.status === 'failed'
                      ? 'pill pill-bad'
                      : it.status === 'running' || it.status === 'pending'
                        ? 'pill pill-warn'
                        : 'pill'
                "
              >
                {{ statusText(it.status) }}
              </span>
            </td>
            <td>
              <a v-if="it.screenshotUrl" :href="it.screenshotUrl" target="_blank" rel="noreferrer">
                <img class="thumb" :src="it.screenshotUrl" />
              </a>
              <span v-else class="pill pill-soft">暂无</span>
            </td>
            <td class="muted mono small" style="white-space: pre-wrap">
              {{ it.parsed ? JSON.stringify(it.parsed, null, 2) : "-" }}
            </td>
          </tr>
          <tr v-if="rows.length === 0">
            <td colspan="4" class="muted">暂无条目。</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
