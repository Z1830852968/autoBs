import { createApp } from "vue";
import { createPinia } from "pinia";
import { createRouter, createWebHistory } from "vue-router";
import App from "./App.vue";
import "./styles.css";

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/", redirect: "/projects" },
    { path: "/projects", component: () => import("./views/ProjectsView.vue") },
    { path: "/tasks", component: () => import("./views/TasksView.vue") },
    { path: "/results", component: () => import("./views/ResultsView.vue") },
    { path: "/settings", component: () => import("./views/SettingsView.vue") },
    { path: "/diagnostics", component: () => import("./views/DiagnosticsView.vue") }
  ]
});

createApp(App).use(createPinia()).use(router).mount("#app");
