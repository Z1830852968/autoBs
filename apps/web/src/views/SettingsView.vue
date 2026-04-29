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
  <div class="grid">
    <div class="card">
      <div class="card-title">
        <div>
          <div class="card-h">运行设置</div>
          <div class="muted small">凭证策略：仅从环境变量读取，前端永远只看到掩码。</div>
        </div>
        <span :class="store.healthOk ? 'pill pill-ok' : 'pill pill-warn'">{{ store.healthOk ? "服务正常" : "服务未知" }}</span>
      </div>
    </div>

    <div class="grid-2">
      <div class="card">
        <div class="card-title">
          <div>
            <div class="card-h">凭证（掩码）</div>
            <div class="muted small">仅用于确认是否已注入，不会暴露真实值。</div>
          </div>
          <span class="pill pill-soft mono">{{ secrets?.mode ?? "-" }}</span>
        </div>

        <div class="grid" style="margin-top: 14px">
          <div v-if="!secrets" class="pill pill-warn">加载中…</div>
          <template v-else>
            <table class="table">
              <thead>
                <tr>
                  <th>提供方</th>
                  <th>值</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(v, k) in secrets.providers" :key="k">
                  <td>{{ k }}</td>
                  <td class="muted mono">{{ v ?? "-" }}</td>
                </tr>
              </tbody>
            </table>
          </template>
        </div>
      </div>

      <div class="card">
        <div class="card-title">
          <div>
            <div class="card-h">路径与产出物</div>
            <div class="muted small">截图等文件通过后端静态路由对外提供。</div>
          </div>
          <span class="pill pill-soft">/artifacts/…</span>
        </div>

        <div class="grid" style="margin-top: 14px">
          <div class="muted mono small">后端端口：8787（可用 PORT 环境变量覆盖）</div>
          <div class="muted mono small">产出物访问：GET /artifacts/&lt;relative_path&gt;</div>
        </div>
      </div>
    </div>
  </div>
</template>
