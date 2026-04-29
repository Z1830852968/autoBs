CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  base_url TEXT NOT NULL,
  crawl_rules TEXT,
  compare_config TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS secrets (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  key TEXT NOT NULL,
  encrypted_value BLOB NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS pages (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  url TEXT NOT NULL,
  content_hash TEXT,
  screenshot_path TEXT,
  ai_analysis_result TEXT,
  cached_at TEXT,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  status TEXT NOT NULL,
  progress REAL NOT NULL DEFAULT 0,
  checkpoint TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS task_items (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  page_id TEXT NOT NULL,
  status TEXT NOT NULL,
  retry_count INTEGER NOT NULL DEFAULT 0,
  result TEXT,
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
  FOREIGN KEY (page_id) REFERENCES pages(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS executions (
  id TEXT PRIMARY KEY,
  task_item_id TEXT NOT NULL,
  screenshot_path TEXT,
  ai_result TEXT,
  comparison_result TEXT,
  FOREIGN KEY (task_item_id) REFERENCES task_items(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS comparisons (
  id TEXT PRIMARY KEY,
  execution_id TEXT NOT NULL,
  baseline_image_path TEXT,
  current_image_path TEXT,
  diff_image_path TEXT,
  ssim_score REAL,
  pixel_diff_ratio REAL,
  ai_judgment TEXT,
  final_verdict TEXT NOT NULL,
  FOREIGN KEY (execution_id) REFERENCES executions(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS ai_usage (
  id TEXT PRIMARY KEY,
  page_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  cost_usd REAL NOT NULL DEFAULT 0,
  cached INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (page_id) REFERENCES pages(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS ai_cache (
  image_hash TEXT NOT NULL,
  prompt_hash TEXT NOT NULL,
  result TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  PRIMARY KEY (image_hash, prompt_hash)
);

CREATE TABLE IF NOT EXISTS page_cache (
  url TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  screenshot_path TEXT,
  ai_result TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (url, content_hash)
);

CREATE INDEX IF NOT EXISTS idx_tasks_project_status ON tasks(project_id, status);
CREATE INDEX IF NOT EXISTS idx_task_items_task_status ON task_items(task_id, status);
CREATE INDEX IF NOT EXISTS idx_ai_cache_expiry ON ai_cache(expires_at);

