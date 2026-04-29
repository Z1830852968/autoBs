<script setup lang="ts">
import { computed } from "vue";
import { useAppStore } from "../stores/app";

const store = useAppStore();

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
  <div class="page-title">
    <div>
      <h2>Results</h2>
      <p>当前任务的产出物快照（截图/阶段结果）</p>
    </div>
    <span class="pill">{{ store.selectedTaskId ? store.selectedTaskId.slice(0, 8) : "-" }}</span>
  </div>

  <div v-if="!store.selectedTaskId" class="card">
    <div style="font-family: var(--mono); color: var(--muted); font-size: 12px">No task selected</div>
  </div>

  <div v-else class="card">
    <table class="table">
      <thead>
        <tr>
          <th>Item</th>
          <th>Status</th>
          <th>Screenshot</th>
          <th>Pipeline</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="it in rows" :key="it.id">
          <td style="color: var(--muted)">{{ it.id.slice(0, 8) }}</td>
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
          <td style="color: var(--muted); white-space: pre-wrap">{{ it.parsed ? JSON.stringify(it.parsed, null, 2) : "-" }}</td>
        </tr>
        <tr v-if="rows.length === 0">
          <td colspan="4" style="color: var(--muted)">No items</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

