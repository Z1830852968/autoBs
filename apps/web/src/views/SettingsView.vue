<script setup lang="ts">
import { onMounted, ref } from "vue";
import { api } from "../lib/api";
import { useAppStore } from "../stores/app";

const store = useAppStore();
const secrets = ref<{ mode: string; providers: Record<string, string | null> } | null>(null);

onMounted(async () => {
  await store.loadHealth();
  secrets.value = await api.getSecrets();
});
</script>

<template>
  <div class="page-title">
    <div>
      <h2>Settings</h2>
      <p>凭证策略：env_only（前端只见掩码）</p>
    </div>
    <span :class="store.healthOk ? 'pill ok' : 'pill warn'">{{ store.healthOk ? "server: ok" : "server: ?" }}</span>
  </div>

  <div class="grid">
    <div class="card">
      <div style="font-family: var(--mono); font-size: 12px; color: var(--muted)">Secrets</div>
      <div style="margin-top: 10px; display: grid; gap: 10px">
        <div v-if="!secrets" class="pill warn">loading</div>
        <template v-else>
          <div class="pill">mode: {{ secrets.mode }}</div>
          <table class="table">
            <thead>
              <tr>
                <th>provider</th>
                <th>value</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(v, k) in secrets.providers" :key="k">
                <td style="color: var(--text)">{{ k }}</td>
                <td style="color: var(--muted); font-family: var(--mono)">{{ v ?? "-" }}</td>
              </tr>
            </tbody>
          </table>
        </template>
      </div>
    </div>

    <div class="card">
      <div style="font-family: var(--mono); font-size: 12px; color: var(--muted)">Paths</div>
      <div style="margin-top: 10px; color: var(--muted); font-family: var(--mono); font-size: 12px">
        Server artifacts: /artifacts/...
      </div>
    </div>
  </div>
</template>

