# autoBs Web 优先实现 Spec

## Why
当前仓库仅包含设计文档。需要将 README 中的架构方案落地为可在浏览器端使用的本地 Web 应用（先不引入 Electron），并为后续接入 Electron 保持架构兼容。

## What Changes
- 建立 pnpm monorepo 工程骨架：apps(web, server) + packages(核心引擎)
- 实现“Web 模式”端到端链路：项目配置 → 任务编排 → 爬取/截图 →（可选）AI 分析 →（可选）图像对比 → 结果浏览与导出
- 落地 SQLite 持久化：项目、任务、子任务、执行记录、对比结果、AI 调用与缓存
- 将凭证管理从 Electron safeStorage 方案调整为“Server 端加密存储/不落地明文”的 Web 兼容方案
- 将 Prompt 外置为 JSON 仓库并支持热更新
- 提供错误处理与降级：AI 不可用时降级为截图归档；单页失败不阻塞整体

## Impact
- Affected specs: 任务可恢复、故障可隔离、成本可控制、模块可替换、安全可审计
- Affected code: 新增 monorepo 全量代码（当前仓库缺少实现代码）

## ADDED Requirements
### Requirement: Web 模式可运行
系统 SHALL 以“本地 Web 应用 + 本地 Node 服务”的形态运行，用户通过浏览器完成项目管理、任务执行与结果查看。

#### Scenario: 启动与访问
- **WHEN** 用户启动 server 与 web
- **THEN** 浏览器可访问 Web 控制台，并能与 server 正常通信（健康检查通过）

### Requirement: 任务持久化与断点恢复
系统 SHALL 将任务、子任务与进度持久化到 SQLite，并支持进程异常退出后继续执行未完成的子任务。

#### Scenario: 崩溃恢复
- **WHEN** 执行中途服务进程退出并重启
- **THEN** 系统从 SQLite 恢复任务队列，并继续执行 status=pending/running 的子任务（避免重复已完成阶段产出物）

### Requirement: Pipeline 阶段化执行
系统 SHALL 将每页处理拆分为 CrawlStage → RenderStage → AnalyzeStage → CompareStage 的可组合阶段，并要求阶段产出物落盘后才进入下一阶段。

#### Scenario: 跳过已完成阶段
- **WHEN** 任务恢复或重复运行同一页
- **THEN** 对于已存在且有效的阶段产出物，Stage.shouldRun 返回 false，系统跳过该阶段

### Requirement: BrowserPool 并发控制
系统 SHALL 复用单例 Browser，并以 Context 池管理并发，默认并发上限可配置。

#### Scenario: 并发限制
- **WHEN** 同时执行超过并发上限的页面任务
- **THEN** 超出部分进入等待队列，不导致资源耗尽或崩溃

### Requirement: AI 调用缓存与降级
系统 SHALL 以 (image_hash, prompt_hash) 为 key 缓存 AI 结果，并在 AI 不可用时降级返回“未分析”，不阻断任务整体完成。

#### Scenario: Provider 全部失败
- **WHEN** 所有 AI Provider 在重试后仍失败或熔断
- **THEN** AnalyzeStage 标记为降级完成，结果记录为 unknown/未分析，并继续后续阶段（若 CompareStage 需要 AI，则同样降级）

### Requirement: 三级图像对比策略
系统 SHALL 提供 SSIM → Pixel 差异（含动态掩码）→ AI 语义判断的三级对比，并将中间指标与最终判决持久化。

#### Scenario: 处于灰区时的 AI 兜底
- **WHEN** 像素差异率处于配置的灰区区间
- **THEN** 系统调用 AI 进行语义判断，并给出最终 pass/fail/unknown

### Requirement: Web 控制台
系统 SHALL 提供 Web UI 包含：项目列表/编辑、任务控制台（启动/暂停/取消/恢复）、结果浏览器、设置、诊断面板。

#### Scenario: 任务进度可视化
- **WHEN** 任务运行中
- **THEN** UI 实时展示总体进度与每页状态（pending/running/completed/failed），并可查看单页产出物（截图、diff、AI 结果）

## MODIFIED Requirements
### Requirement: SecretsManager（Web 兼容）
系统 SHALL 确保 API Key、密码等敏感信息不以明文落盘。

#### Behavior
- Server 端 SHALL 支持两种模式之一（实现时择一并在文档中明确）：
  - 模式 A：默认不持久化敏感信息，仅从环境变量或启动参数读取
  - 模式 B：允许持久化，但必须使用 Server 端加密（密钥不与密文同存；不在日志/接口返回中泄露）
- Web 前端 SHALL 仅展示掩码值（例如 ****1234），不得获取明文

## REMOVED Requirements
### Requirement: Electron Shell（本阶段）
**Reason**: 用户要求先在浏览器端运行与验证完整链路，再考虑接入 Electron。
**Migration**: 保持核心引擎 packages 与 server API 的稳定边界，后续新增 apps/electron 作为薄壳复用既有能力。

