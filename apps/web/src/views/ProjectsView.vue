<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useAppStore } from "../stores/app";

const store = useAppStore();

const name = ref("");
const baseUrl = ref("");
const pageUrl = ref("");

const hasSelection = computed(() => store.selectedProjectId.length > 0);
const healthPill = computed(() => {
  if (store.healthOk === null) return { cls: "pill pill-warn", text: "服务未知" };
  return store.healthOk ? { cls: "pill pill-ok", text: "服务正常" } : { cls: "pill pill-bad", text: "服务异常" };
});

async function createProject() {
  await store.createProject({ name: name.value || "Untitled", baseUrl: baseUrl.value });
  name.value = "";
  baseUrl.value = "";
}

async function saveProject() {
  if (!store.project) return;
  await store.updateProject({ name: store.project.name, baseUrl: store.project.baseUrl });
}

async function addPage() {
  if (!pageUrl.value) return;
  await store.addPage(pageUrl.value);
  pageUrl.value = "";
}

onMounted(async () => {
  await store.loadHealth();
  await store.loadProjects();
});
</script>

<template>
  <div class="grid">
    <div class="card">
      <div class="card-title">
        <div>
          <div class="card-h">开始之前</div>
          <div class="muted small">推荐流程：创建项目 → 添加页面 → 去「任务」启动 → 在「结果」查看截图与数据</div>
        </div>
        <span :class="healthPill.cls">{{ healthPill.text }}</span>
      </div>
    </div>

    <div v-if="store.lastError" class="notice notice-bad mono small">{{ store.lastError }}</div>

    <div class="grid-2">
      <div class="card">
        <div class="card-title">
          <div>
            <div class="card-h">新建项目</div>
            <div class="muted small">一个项目对应一个站点/系统，页面会存入本地 SQLite。</div>
          </div>
          <span class="pill pill-soft">创建后自动选中</span>
        </div>

        <div class="grid" style="margin-top: 14px">
          <div class="field">
            <label>项目名称</label>
            <input v-model="name" placeholder="例如：回归巡检（测试环境）" />
          </div>
          <div class="field">
            <label>基础 URL</label>
            <input v-model="baseUrl" placeholder="例如：https://example.com" />
          </div>
          <div class="toolbar">
            <button class="btn btn-primary" @click="createProject">创建并打开</button>
            <button class="btn" @click="store.loadProjects">刷新列表</button>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-title">
          <div>
            <div class="card-h">项目列表</div>
            <div class="muted small">选择一个项目后，可以继续配置页面。</div>
          </div>
          <span class="pill pill-soft">{{ store.projects.length }} 个</span>
        </div>

        <table class="table" style="margin-top: 14px">
          <thead>
            <tr>
              <th>名称</th>
              <th>基础 URL</th>
              <th style="width: 120px">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="p in store.projects" :key="p.id">
              <td>{{ p.name }}</td>
              <td class="muted">{{ p.baseUrl }}</td>
              <td>
                <button class="btn" @click="store.loadProject(p.id)">打开</button>
              </td>
            </tr>
            <tr v-if="store.projects.length === 0">
              <td colspan="3" class="muted">暂无项目，先在左侧创建一个。</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div v-if="hasSelection" class="card">
      <div class="card-title">
        <div>
          <div class="card-h">当前项目：{{ store.project?.name }}</div>
          <div class="muted small">项目 ID：<span class="mono">{{ store.selectedProjectId }}</span></div>
        </div>
        <span class="pill pill-soft">页面：{{ store.pages.length }}</span>
      </div>

      <div class="grid-2" style="margin-top: 14px">
        <div class="field">
          <label>项目名称</label>
          <input v-model="store.project!.name" />
        </div>
        <div class="field">
          <label>基础 URL</label>
          <input v-model="store.project!.baseUrl" />
        </div>
      </div>
      <div class="toolbar" style="margin-top: 12px">
        <button class="btn btn-primary" @click="saveProject">保存修改</button>
      </div>

      <div class="grid" style="margin-top: 16px">
        <div class="card" style="background: rgba(0, 0, 0, 0.16); border-color: rgba(255, 255, 255, 0.1)">
          <div class="card-title">
            <div>
              <div class="card-h">添加页面</div>
              <div class="muted small">输入完整 URL；任务页面选择将以这里的清单为准。</div>
            </div>
            <span class="pill pill-soft">支持多页</span>
          </div>

          <div class="grid" style="margin-top: 14px">
            <div class="field">
              <label>页面 URL</label>
              <input v-model="pageUrl" placeholder="例如：https://example.com/path" />
            </div>
            <div class="toolbar">
              <button class="btn btn-primary" @click="addPage" :disabled="!pageUrl">添加页面</button>
            </div>
          </div>
        </div>

        <table class="table">
          <thead>
            <tr>
              <th>页面 URL</th>
              <th style="width: 140px">页 ID</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="pg in store.pages" :key="pg.id">
              <td>{{ pg.url }}</td>
              <td class="muted mono">{{ pg.id.slice(0, 8) }}</td>
            </tr>
            <tr v-if="store.pages.length === 0">
              <td colspan="2" class="muted">还没有页面，先添加至少一个 URL。</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>
