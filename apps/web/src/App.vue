<template>
  <div class="shell">
    <div v-if="sidebarOpen" class="shell-backdrop" @click="sidebarOpen = false" />

    <aside class="shell-sidebar" :class="{ open: sidebarOpen }">
      <div class="brand">
        <div class="brand-mark">autoBs</div>
        <div class="brand-sub">自动化巡检台</div>
      </div>

      <nav class="nav">
        <router-link v-for="item in navItems" :key="item.to" :to="item.to" class="nav-item" @click="sidebarOpen = false">
          <span class="nav-icon" aria-hidden="true" v-html="item.icon" />
          <span class="nav-label">{{ item.label }}</span>
        </router-link>
      </nav>

      <div class="sidebar-foot">
        <div class="meta-row">
          <span class="meta-k">服务</span>
          <span :class="healthBadge.cls">{{ healthBadge.text }}</span>
        </div>
        <div class="meta-row">
          <span class="meta-k">项目</span>
          <span class="meta-v">{{ currentProjectText }}</span>
        </div>
        <div class="meta-row">
          <span class="meta-k">任务</span>
          <span class="meta-v">{{ currentTaskText }}</span>
        </div>
      </div>
    </aside>

    <section class="shell-main">
      <header class="topbar">
        <button class="icon-btn" type="button" @click="sidebarOpen = true" aria-label="打开导航">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
          </svg>
        </button>
        <div class="topbar-title">
          <div class="topbar-h">{{ pageTitle }}</div>
          <div class="topbar-p">{{ pageDesc }}</div>
        </div>
        <div class="topbar-right">
          <router-link class="pill pill-soft" to="/projects">项目</router-link>
          <router-link class="pill pill-soft" to="/tasks">任务</router-link>
        </div>
      </header>

      <main class="content">
        <router-view />
      </main>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRoute } from "vue-router";
import { useAppStore } from "./stores/app";

const store = useAppStore();
const route = useRoute();
const sidebarOpen = ref(false);

const navItems = [
  {
    to: "/projects",
    label: "项目",
    icon: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path d="M4 7.5c0-1.4 1.1-2.5 2.5-2.5h4l1.4 1.6c.4.4.9.6 1.4.6H19.5C20.9 7.2 22 8.3 22 9.7v6.8c0 1.4-1.1 2.5-2.5 2.5H6.5C5.1 19 4 17.9 4 16.5V7.5Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
      <path d="M7 13h10" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
    </svg>`
  },
  {
    to: "/tasks",
    label: "任务",
    icon: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path d="M7 4h10a3 3 0 0 1 3 3v11a2 2 0 0 1-2 2H7a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
      <path d="M8 9h8M8 13h6M8 17h5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
    </svg>`
  },
  {
    to: "/results",
    label: "结果",
    icon: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path d="M6.5 20h11A2.5 2.5 0 0 0 20 17.5v-11A2.5 2.5 0 0 0 17.5 4h-11A2.5 2.5 0 0 0 4 6.5v11A2.5 2.5 0 0 0 6.5 20Z" stroke="currentColor" stroke-width="1.8"/>
      <path d="M8 15l2-2 2 2 4-5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`
  },
  {
    to: "/settings",
    label: "设置",
    icon: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path d="M12 15.8a3.8 3.8 0 1 0 0-7.6 3.8 3.8 0 0 0 0 7.6Z" stroke="currentColor" stroke-width="1.8"/>
      <path d="M19.4 13.2v-2.4l-1.9-.6a7.6 7.6 0 0 0-.7-1.6l.9-1.8-1.7-1.7-1.8.9c-.5-.3-1-.5-1.6-.7L13.2 4h-2.4l-.6 1.9c-.6.2-1.1.4-1.6.7l-1.8-.9L5.1 7.4l.9 1.8c-.3.5-.5 1-.7 1.6l-1.9.6v2.4l1.9.6c.2.6.4 1.1.7 1.6l-.9 1.8 1.7 1.7 1.8-.9c.5.3 1 .5 1.6.7l.6 1.9h2.4l.6-1.9c.6-.2 1.1-.4 1.6-.7l1.8.9 1.7-1.7-.9-1.8c.3-.5.5-1 .7-1.6l1.9-.6Z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/>
    </svg>`
  },
  {
    to: "/diagnostics",
    label: "诊断",
    icon: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path d="M12 3.5c4.7 0 8.5 3.8 8.5 8.5S16.7 20.5 12 20.5 3.5 16.7 3.5 12 7.3 3.5 12 3.5Z" stroke="currentColor" stroke-width="1.8"/>
      <path d="M12 7v5l3 2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`
  }
] as const;

const healthBadge = computed(() => {
  if (store.healthOk === null) return { cls: "pill pill-warn", text: "未知" };
  return store.healthOk ? { cls: "pill pill-ok", text: "正常" } : { cls: "pill pill-bad", text: "异常" };
});

const currentProjectText = computed(() => {
  if (store.project?.name) return store.project.name;
  if (store.selectedProjectId) return store.selectedProjectId.slice(0, 8);
  return "未选择";
});

const currentTaskText = computed(() => {
  if (store.selectedTaskId) return store.selectedTaskId.slice(0, 8);
  return "未选择";
});

const pageMeta = computed(() => {
  const p = route.path;
  if (p.startsWith("/projects")) return { title: "项目", desc: "创建项目、维护页面清单，为后续任务准备素材" };
  if (p.startsWith("/tasks")) return { title: "任务", desc: "选择页面并启动任务，实时查看进度与截图产出" };
  if (p.startsWith("/results")) return { title: "结果", desc: "按任务查看每个页面的截图与流水线结果" };
  if (p.startsWith("/settings")) return { title: "设置", desc: "查看环境凭证与运行策略（前端仅展示掩码）" };
  if (p.startsWith("/diagnostics")) return { title: "诊断", desc: "服务健康、SSE 连接与最近任务概览" };
  return { title: "autoBs", desc: "自动化巡检台" };
});

const pageTitle = computed(() => pageMeta.value.title);
const pageDesc = computed(() => pageMeta.value.desc);

onMounted(async () => {
  await store.loadHealth();
});
</script>
