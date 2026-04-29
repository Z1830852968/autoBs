# autoBs — 智能测试桌面工具

> 企业级Web自动化测试平台，具备任务持久化、AI辅助分析、智能图像对比和故障恢复能力

## 📋 目录

- [原方案问题](#原方案问题)
- [设计原则](#设计原则)
- [架构全景](#架构全景)
- [Monorepo 目录结构](#monorepo-目录结构)
- [核心模块设计](#核心模块设计)
- [数据库设计](#数据库设计)
- [错误处理策略](#错误处理策略)
- [快速开始](#快速开始)
- [技术栈](#技术栈)
- [贡献指南](#贡献指南)

---

## 原方案问题

| 问题 | 影响 |
|------|------|
| **无任务持久化** | 崩溃后进度全丢，无法断点续跑 |
| **凭证明文存储** | API Key和密码直接存SQLite，无加密 |
| **AI无缓存无降级** | 同一页面反复调模型，成本失控；任一Provider挂掉全链路中断 |
| **图像对比粗糙** | pixelmatch对动态内容（时间戳、随机ID）误报率极高 |
| **核心逻辑耦合Electron** | 无法独立测试，无法脱离桌面壳运行 |
| **Prompt硬编码** | 迭代prompt要改代码重新打包 |
| **无错误恢复** | 无重试、无熔断、无降级策略 |

---

## 设计原则

```
✓ 任务可恢复     — 断点续跑，不重复已完成工作
✓ 故障可隔离     — 单页失败不影响整体，AI挂了降级为截图归档
✓ 成本可控制     — 缓存 + 去重 + 降级，前端展示费用统计
✓ 模块可替换     — 核心引擎脱离Electron可独立运行和测试
✓ 安全可审计     — 凭证用系统原生加密，API Key不落盘明文
```

---

## 架构全景

```
┌─────────────────────────────────────────────────────────────┐
│                    Electron Shell                            │
│  ┌───────────────────────────────────────────────────────┐   │
│  │  Renderer (Vue 3 + Pinia + Vite)                      │   │
│  │  项目管理 | 测试控制台 | 结果浏览器 | 设置 | 诊断面板  │   │
│  └──────────────────┬──────────────────────────────────┘   │
│                     │ IPC (contextBridge)                   │
│  ┌──────────────────▼──────────────────────────────────┐   │
│  │        Main Process (Node.js 20+)                    │   │
│  │                                                      │   │
│  │  ┌──────────────────────────────────────────────┐   │   │
│  │  │ IPC Router + EventBus + SecretsManager       │   │   │
│  │  └──────────────────────────────────────────────┘   │   │
│  │                                                      │   │
│  │  ═══ 核心引擎层 (脱离Electron独立运行) ═══           │   │
│  │                                                      │   │
│  │  ┌──────────────────────────────────────────────┐   │   │
│  │  │ TaskOrchestrator (任务编排层)                 │   │   │
│  │  │ • 持久化任务队列 (SQLite)                    │   │   │
│  │  │ • 有限状态机 IDLE→RUNNING→PAUSED→DONE      │   │   │
│  │  │ • Checkpoint 断点恢复                        │   │   │
│  │  └──────────────────────────────────────────────┘   │   │
│  │                                                      │   │
│  │  ┌──────────────────────────────────────────────┐   │   │
│  │  │ Pipeline (可组合处理阶段)                     │   │   │
│  │  │ CrawlStage → RenderStage                      │   │   │
│  │  │ → AnalyzeStage → CompareStage                 │   │   │
│  │  │ 每个Stage: shouldRun→execute→onError          │   │   │
│  │  │ 产出物落盘后才进下一阶段                       │   │   │
│  │  └──────────────────────────────────────────────┘   │   │
│  │                                                      │   │
│  │  ┌────────────┐ ┌──────────┐ ┌────────────────┐    │   │
│  │  │BrowserPool │ │AIService │ │ImageProcessor  │    │   │
│  │  │单例Browser │ │缓存+重试 │ │三级对比        │    │   │
│  │  │信号量控制  │ │熔断+降级 │ │SSIM+像素+AI    │    │   │
│  │  │Context池   │ │成本追踪  │ │语义判断        │    │   │
│  │  └────────────┘ └──────────┘ └────────────────┘    │   │
│  │  ┌────────────┐ ┌──────────┐ ┌────────────────┐    │   │
│  │  │CacheLayer  │ │PromptRepo│ │Logger          │    │   │
│  │  │页面+AI结果 │ │JSON文件  │ │pino 结构化     │    │   │
│  │  │感知哈希去重│ │可热更新  │ │文件+控制台     │    │   │
│  │  └────────────┘ └──────────┘ └────────────────┘    │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

---

## Monorepo 目录结构

```
auto-tester/
├── apps/
│   ├── electron/                    # Electron薄壳：窗口管理 + IPC路由
│   │   ├── main.ts
│   │   ├── preload.ts
│   │   └── ipc/handlers/            # project.ts, task.ts, settings.ts
│   │
│   ├── server/                      # 轻量模式：本地HTTP服务（可选）
│   │
│   └── renderer/                    # Vue 3 前端
│       └── src/
│           ├── stores/              # Pinia: project, task, diagnostics
│           ├── views/               # 项目列表/测试控制台/结果/报告/诊断
│           ├── components/          # 可复用组件
│           └── composables/         # useIpc.ts, useTask.ts
│
├── packages/                        # 核心引擎（脱离Electron可独立测试）
│   ├── core/                        # 基础库
│   │   ├── types.ts                 # 类型定义
│   │   ├── errors.ts                # 错误类型
│   │   └── event-emitter.ts         # 事件发射器
│   │
│   ├── task-orchestrator/           # 任务编排
│   │   ├── orchestrator.ts          # 状态机 + 持久化队列
│   │   └── checkpoint.ts            # 断点恢复机制
│   │
│   ├── pipeline/                    # Pipeline 引擎
│   │   ├── pipeline.ts              # 核心Pipeline
│   │   └── stages/
│   │       ├── crawl-stage.ts       # 爬取页面
│   │       ├── render-stage.ts      # 渲染截图
│   │       ├── analyze-stage.ts     # AI分析
│   │       └── compare-stage.ts     # 图像对比
│   │
│   ├── browser-pool/                # 浏览器管理
│   │   ├── pool.ts                  # 单例Browser + Context池
│   │   ├── semaphore.ts             # 信号量控制
│   │   └── route-interceptor.ts     # 资源拦截
│   │
│   ├── ai-service/                  # AI服务
│   │   ├── service.ts               # 缓存 + 重试 + 熔断
│   │   ├── providers/               # 各Provider实现
│   │   │   ├── zhipu.ts
│   │   │   ├── qwen.ts
│   │   │   ├── deepseek.ts
│   │   │   └── custom.ts
│   │   ├── cost-tracker.ts          # 费用追踪
│   │   └── circuit-breaker.ts       # 熔断器
│   │
│   ├── image-processor/             # 图像处理
│   │   ├── processor.ts             # 三级对比策略
│   │   ├── ssim.ts                  # SSIM算法
│   │   ├── pixelmatch.ts            # 像素对比
│   │   └── dynamic-mask.ts          # 动态区域掩码
│   │
│   ├── prompt-repo/                 # Prompt 仓库
│   │   ├── repository.ts            # 加载 + 热更新
│   │   └── prompts/                 # Prompt JSON文件
│   │       ├── analyze-page.v2.json
│   │       └── compare-regression.v1.json
│   │
│   ├── storage/                     # 数据层
│   │   ├── db.ts                    # SQLite连接 + 迁移
│   │   ├── secrets-manager.ts       # 凭证加密存储
│   │   └── migrations/              # 数据库迁移
│   │
│   └── logger/                      # 日志系统
│       └── logger.ts                # pino 结构化日志
│
├── data/                            # 运行时数据 (.gitignore)
│   ├── db.sqlite
│   ├── screenshots/
│   └── logs/
│
├── tests/
│   ├── fixtures/                    # 测试数据
│   ├── e2e/                         # 端到端测试
│   └── integration/                 # 集成测试
│
├── pnpm-workspace.yaml
├── turbo.json
├── package.json
└── README.md
```

---

## 核心模块设计

### 1️⃣ TaskOrchestrator — 任务编排

**职责**：持久化任务队列、状态机管理、断点恢复

```typescript
// 状态机流转
IDLE → RUNNING → PAUSED → COMPLETED/CANCELLED

// 关键特性
• 任务和子任务均存SQLite
• 每个子任务（每页一个）独立状态
• 崩溃恢复：捞 status='pending' 的子任务继续执行
• Progress 增量更新，无重复计算
```

### 2️⃣ Pipeline — 可组合阶段引擎

**职责**：各阶段按序执行，支持跳过和降级

```typescript
interface Stage {
  shouldRun(): Promise<boolean>    // 检查产出物是否已存在
  execute(): Promise<Output>       // 核心处理逻辑
  onError(): retry|skip|abort|fallback  // 错误处理策略
}

// 阶段链路
CrawlStage(爬取) → RenderStage(渲染) → AnalyzeStage(分析) → CompareStage(对比)
↓ 每个阶段的产出物落盘后才进下一阶段
```

### 3️⃣ BrowserPool — 浏览器资源池

**职责**：高效管理Playwright浏览器实例

```typescript
• 单例 Browser 复用，只创建/销毁轻量 Context
• 信号量限制并发（默认4）防止资源耗尽
• Context 超时保护（120s）防止泄漏
• Route 拦截屏蔽图片/字体/追踪脚本加速爬取 (速度提升3-5倍)
• 自动cleanup处理异常case
```

### 4️⃣ AIService — 智能分析服务

**职责**：多Provider管理、缓存、重试、成本控制

```typescript
调用链路：
缓存命中 → 按优先级尝试Provider（带熔断器）
  → 指数退避重试(1s, 2s, 4s) 
  → 全部失败则降级返回"未分析"

特性：
• 缓存key基于 image_hash + prompt_hash（避免重复调用）
• 熔断器：连续失败3次后30s熔断期
• 429限流：尊重 Retry-After 头，默认等待60s
• 前端展示费用统计（token数 × 单价）
```

### 5️⃣ ImageProcessor — 智能图像对比

**职责**：三级对比策略，智能区分真假回归

```
Level 1: SSIM > 0.98 → PASS ✓
    ↓ (快速通过，避���下层开销)

Level 2: Pixelmatch 像素对比 + 动态区域掩码
    • 排除时间戳、随机ID、计数器等动态内容
    • 像素差异率 < 0.5% → PASS ✓
    • 像素差异率 > 30% → FAIL ✗
    ↓ (处于灰色地带 0.5%-30%)

Level 3: AI 语义判断
    • 提交截图对给大模型
    • "这两张截图在功能上是否相同？"
    • 高置信度结果 → 最终判决
```

### 6️⃣ PromptRepository — Prompt 外置管理

**职责**：版本化、热更新、无需重编译

```json
// prompts/analyze-page.v2.json
{
  "version": "2.0",
  "model_type": "vision",
  "variables": ["image_base64", "page_url"],
  "template": "分析该页面截图，提取关键信息..."
}
```

### 7️⃣ SecretsManager — 凭证安全管理

**职责**：使用系统原生加密，永不落盘明文

```typescript
// 使用 electron.safeStorage
// macOS: Keychain
// Windows: DPAPI
// Linux: libsecret

特性：
• API Key 永不通过 IPC 传回渲染进程
• 前端只看掩码版本 (****xxxx)
• 支持Rotating密钥，自动过期提醒
```

---

## 数据库设计

### 核心表结构

```sql
-- 项目配置
CREATE TABLE projects (
  id PRIMARY KEY,
  name TEXT,
  base_url TEXT,
  crawl_rules JSON,      -- 选择器规则
  compare_config JSON,   -- 对比配置（阈值等）
  created_at TIMESTAMP
);

-- 凭证加密存储
CREATE TABLE secrets (
  id PRIMARY KEY,
  project_id FOREIGN KEY,
  key TEXT,              -- "api_key_zhipu", "password" 等
  encrypted_value BLOB,  -- electron.safeStorage 加密
  updated_at TIMESTAMP
);

-- 页面数据
CREATE TABLE pages (
  id PRIMARY KEY,
  project_id FOREIGN KEY,
  url TEXT,
  content_hash TEXT,     -- 页面DOM hash（变化则重新爬取）
  screenshot_path TEXT,
  ai_analysis_result TEXT,
  cached_at TIMESTAMP
);

-- 任务（顶级）
CREATE TABLE tasks (
  id PRIMARY KEY,
  project_id FOREIGN KEY,
  status ENUM(idle, running, paused, completed, cancelled),
  progress FLOAT,        -- 0.0-1.0
  checkpoint JSON,       -- 恢复点
  created_at TIMESTAMP,
  completed_at TIMESTAMP
);

-- 子任务（每页一个）
CREATE TABLE task_items (
  id PRIMARY KEY,
  task_id FOREIGN KEY,
  page_id FOREIGN KEY,
  status ENUM(pending, running, completed, failed),
  retry_count INT,
  result TEXT           -- 本页结果
);

-- 执行记录
CREATE TABLE executions (
  id PRIMARY KEY,
  task_item_id FOREIGN KEY,
  screenshot_path TEXT,
  ai_result TEXT,
  comparison_result TEXT
);

-- 对比结果
CREATE TABLE comparisons (
  id PRIMARY KEY,
  execution_id FOREIGN KEY,
  baseline_image_path TEXT,
  current_image_path TEXT,
  diff_image_path TEXT,
  ssim_score FLOAT,
  pixel_diff_ratio FLOAT,
  ai_judgment TEXT,      -- "same" / "different" / "unknown"
  final_verdict TEXT     -- "pass" / "fail"
);

-- AI 调用记录
CREATE TABLE ai_usage (
  id PRIMARY KEY,
  page_id FOREIGN KEY,
  provider TEXT,         -- "zhipu", "qwen" 等
  model TEXT,
  input_tokens INT,
  output_tokens INT,
  cost_usd FLOAT,
  cached BOOLEAN,        -- 是否命中缓存
  created_at TIMESTAMP
);

-- AI 缓存表
CREATE TABLE ai_cache (
  image_hash TEXT,
  prompt_hash TEXT,
  result TEXT,
  PRIMARY KEY (image_hash, prompt_hash),
  expires_at TIMESTAMP   -- 7天过期
);

-- 页面缓存表
CREATE TABLE page_cache (
  url TEXT,
  content_hash TEXT,
  screenshot_path TEXT,
  ai_result TEXT,
  PRIMARY KEY (url, content_hash),
  created_at TIMESTAMP
);
```

**索引优化**：
```sql
CREATE INDEX idx_tasks_project_status ON tasks(project_id, status);
CREATE INDEX idx_task_items_task_status ON task_items(task_id, status);
CREATE INDEX idx_ai_cache_expiry ON ai_cache(expires_at);
```

**关键决策**：
- 采用 **SQLite WAL模式** → 读写不阻塞，崩溃恢复可靠
- 凭证用 `BLOB` 存储加密数据 → 无法直接读取
- `content_hash` 和 `ai_cache` 加速增量执行 → 避免重复工作

---

## 错误处理策略

| 场景 | 处理策略 |
|------|---------|
| **页面加载超时** | 重试2次，间隔3s，跳过 |
| **AI调用超时** | 指数退避重试3次 (1s, 2s, 4s) |
| **AI 429限流** | 等待 Retry-After，默认60s |
| **AI连续3次失败** | 熔断30s，期间降级为"未分析" |
| **所有Provider不可用** | 跳过AI分析，仅保留截图归档 |
| **网络断开** | 暂停任务，恢复后继续运行 |
| **Context泄漏** | 120s超时自动清理 |
| **任务进程崩溃** | 重启时捞pending任务续跑 |

---

## 快速开始

### 环境要求

- **Node.js**: 20.0+
- **pnpm**: 10.0+
- **操作系统**: macOS 10.15+ / Windows 10+ / Ubuntu 18+

### 安装依赖

```bash
# 克隆仓库
git clone https://github.com/Z1830852968/autoBs.git
cd autoBs

# 安装依赖
pnpm install

# 启动本地 API / Worker
pnpm dev:server

# 启动 Web 控制台
pnpm dev:web
```

打开浏览器访问：
- http://localhost:5173

运行时数据默认落在：
- `./data/db.sqlite`
- `./data/screenshots/`

### Secrets（Web 模式）

当前 Web 模式默认采用 **env_only** 策略：Server 从环境变量读取密钥，前端只展示掩码，不会拿到明文。

可用环境变量：
- `ZHIPU_API_KEY`
- `QWEN_API_KEY`
- `DEEPSEEK_API_KEY`

### 运行开关

- `AUTOBS_BROWSER_MOCK`: `true/false`，启用后截图走 mock（写入 1x1 PNG，占位）

### Playwright（真实截图）

默认截图为真实 Playwright（Chromium）。首次运行或提示找不到浏览器时，先执行：

```bash
pnpm playwright:install
```

Linux 若缺少系统依赖库（例如 libatk 等），执行：

```bash
pnpm playwright:install-deps
```

运行离线“真实 e2e”验收（本地静态站点 → 跑任务 → 校验截图非 1x1）：

```bash
pnpm test:e2e:real
```

### 开发工作流

```bash
# 全量开发（web + server）
pnpm dev

# 运行测试
pnpm test

# 类型检查
pnpm type-check

# 构建
pnpm build
```

### 配置示例

目前以 Web 控制台创建项目与页面清单为主：
- Projects：创建项目（name/baseUrl）
- 添加 page URL
- Tasks：选择页面并 Run，产出截图与阶段结果
 
后续会补齐完整的 crawl 规则/对比阈值/AI provider 配置表单与导出能力。

---

## 技术栈

| 领域 | 技术选型 | 理由 |
|------|--------|------|
| **包管理** | pnpm | monorepo支持，依赖管理严格 |
| **构建工具** | Vite + Turborepo | 极速构建，增量编译 |
| **桌面壳** | （暂不引入） | Web 优先验证完整链路，后续可加 Electron 薄壳 |
| **前端** | Vue 3 + Pinia | 组合式API，类型安全 |
| **浏览器自动化** | playwright-core | headless 截图与页面渲染 |
| **数据库** | node:sqlite (WAL模式) | 内嵌式，无服务，崩溃恢复可靠 |
| **图像对比** | pngjs + SSIM/像素差异 + AI兜底 | 三级策略落地（本阶段为最小实现） |
| **Secrets** | env_only | Server 读环境变量；前端只展示掩码 |
| **日志** | JSON logger（内置） | 结构化输出，便于采集 |
| **HTTP** | 原生 fetch | Server/Web 统一使用 |
| **类型检查** | TypeScript | 完整的类型安全 |
| **测试框架** | node:test + Vitest | Node 侧单测/集成/e2e + Web 壳 |

---

## 关键决策速查表

| 决策 | 理由 |
|-----|------|
| **pnpm monorepo** | 核心引擎可独立测试；后续可加 Electron 薄壳 |
| **Web 优先** | 先把任务持久化/断点恢复/产出物落盘跑通，再扩展桌面壳 |
| **SSIM+像素差异+AI三级** | 单一像素对比对动态内容误报率高，需要语义兜底 |
| **env_only secrets** | 先保证“不落地明文”，后续再补齐加密持久化方案 |
| **SQLite WAL模式** | 读写不阻塞，崩溃恢复可靠 |
| **Prompt外置JSON** | 版本管理、热更新，无需改代码重打包 |
| **Playwright route拦截** | 屏蔽非关键资源，爬取速度提升3-5倍 |
| **结构化日志** | 统一 JSON 输出，便于排查任务级错误与复现 |
| **signleton BrowserPool** | Context轻量，复用率高，内存稳定 |
| **感知哈希去重** | 识别相似内容，避免重复AI调用，降低成本50%+ |

---

## 开发路线图

- [ ] **Phase 1**: 核心引擎 + Pipeline + BrowserPool
- [ ] **Phase 2**: AI Service + 三级图像对比
- [ ] **Phase 3**: Electron UI + IPC + 任务持久化
- [ ] **Phase 4**: 分布式爬取（可选）+ 服务端部署
- [ ] **Phase 5**: 开源社区版本

---

## 贡献指南

欢迎贡献代码、报告Bug、提出建议！

### 贡献流程

1. Fork本仓库
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 开启Pull Request

### 代码规范

- 遵循 TypeScript 严格模式
- 使用 Prettier 格式化代码
- 编写单元测试（覆盖率>80%）
- 遵循 Conventional Commits 规范

---

## 许可证

本项目采用 **MIT License**。详见 [LICENSE](LICENSE) 文件。

---

## 联系与支持

- **GitHub Issues**: [报告问题](https://github.com/Z1830852968/autoBs/issues)
- **Discussions**: [讨论功能](https://github.com/Z1830852968/autoBs/discussions)
- **GitHub**: [@Z1830852968](https://github.com/Z1830852968)

---

**最后更新**: 2026-04-29 | **维护者**: Z1830852968
