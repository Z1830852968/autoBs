<template>
  <div class="app-shell">
    <aside class="sidebar">
      <div class="brand">
        <h1>autoBs</h1>
        <span class="tag">web</span>
      </div>
      <nav class="nav">
        <router-link to="/projects">
          <span>Projects</span>
          <span class="hint">P</span>
        </router-link>
        <router-link to="/tasks">
          <span>Tasks</span>
          <span class="hint">T</span>
        </router-link>
        <router-link to="/results">
          <span>Results</span>
          <span class="hint">R</span>
        </router-link>
        <router-link to="/settings">
          <span>Settings</span>
          <span class="hint">S</span>
        </router-link>
        <router-link to="/diagnostics">
          <span>Diagnostics</span>
          <span class="hint">D</span>
        </router-link>
      </nav>
    </aside>
    <section class="main">
      <router-view />
    </section>
  </div>
</template>
