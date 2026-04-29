<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useAppStore } from "../stores/app";

const store = useAppStore();

const name = ref("");
const baseUrl = ref("");
const pageUrl = ref("");

const hasSelection = computed(() => store.selectedProjectId.length > 0);
const healthPill = computed(() => {
  if (store.healthOk === null) return { cls: "pill warn", text: "health: ?" };
  return store.healthOk ? { cls: "pill ok", text: "health: ok" } : { cls: "pill bad", text: "health: bad" };
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
  <div class="page-title">
    <div>
      <h2>Projects</h2>
      <p>本地项目配置与页面清单（存 SQLite）</p>
    </div>
    <span :class="healthPill.cls">{{ healthPill.text }}</span>
  </div>

  <div v-if="store.lastError" class="card" style="border-color: rgba(255, 90, 122, 0.35)">
    <div style="font-family: var(--mono); font-size: 12px; color: rgba(255, 90, 122, 0.95)">
      {{ store.lastError }}
    </div>
  </div>

  <div class="grid" style="margin-top: 14px">
    <div class="card">
      <div class="row">
        <div class="field">
          <label>Project Name</label>
          <input v-model="name" placeholder="E2E Regression" />
        </div>
        <div class="field">
          <label>Base URL</label>
          <input v-model="baseUrl" placeholder="https://example.com" />
        </div>
      </div>
      <div style="display: flex; gap: 10px; margin-top: 12px">
        <button class="btn primary" @click="createProject">Create</button>
        <button class="btn" @click="store.loadProjects">Refresh</button>
      </div>
    </div>

    <div class="card">
      <div style="display: flex; align-items: center; justify-content: space-between">
        <div style="font-family: var(--mono); font-size: 12px; color: var(--muted)">Project List</div>
        <span class="pill">{{ store.projects.length }} items</span>
      </div>

      <table class="table" style="margin-top: 12px">
        <thead>
          <tr>
            <th>Name</th>
            <th>Base</th>
            <th style="width: 120px">Action</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="p in store.projects" :key="p.id">
            <td style="color: var(--text)">{{ p.name }}</td>
            <td style="color: var(--muted)">{{ p.baseUrl }}</td>
            <td>
              <button class="btn" @click="store.loadProject(p.id)">Open</button>
            </td>
          </tr>
          <tr v-if="store.projects.length === 0">
            <td colspan="3" style="color: var(--muted)">No projects</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-if="hasSelection" class="card">
      <div style="display: flex; align-items: center; justify-content: space-between; gap: 12px">
        <div>
          <div style="font-family: var(--mono); font-size: 12px; color: var(--muted)">Selected Project</div>
          <div style="margin-top: 4px; font-size: 18px">{{ store.project?.name }}</div>
        </div>
        <span class="pill">{{ store.selectedProjectId }}</span>
      </div>

      <div class="row" style="margin-top: 14px">
        <div class="field">
          <label>Name</label>
          <input v-model="store.project!.name" />
        </div>
        <div class="field">
          <label>Base URL</label>
          <input v-model="store.project!.baseUrl" />
        </div>
      </div>
      <div style="display: flex; gap: 10px; margin-top: 12px">
        <button class="btn primary" @click="saveProject">Save</button>
      </div>

      <div style="height: 1px; background: rgba(255, 255, 255, 0.1); margin: 14px 0" />

      <div class="row">
        <div class="field" style="grid-column: span 2">
          <label>Add Page URL</label>
          <input v-model="pageUrl" placeholder="https://example.com/path" />
        </div>
      </div>
      <div style="display: flex; gap: 10px; margin-top: 12px">
        <button class="btn primary" @click="addPage">Add</button>
      </div>

      <table class="table" style="margin-top: 14px">
        <thead>
          <tr>
            <th>URL</th>
            <th style="width: 140px">Page ID</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="pg in store.pages" :key="pg.id">
            <td style="color: var(--text)">{{ pg.url }}</td>
            <td style="color: var(--muted)">{{ pg.id.slice(0, 8) }}</td>
          </tr>
          <tr v-if="store.pages.length === 0">
            <td colspan="2" style="color: var(--muted)">No pages</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

