# autoBs 真实可用性验收 Spec

## Why
当前系统在部分场景下会启用 mock（例如 CI 环境），导致看似“跑通”但实际并未进行真实截图/真实链路验证，用户侧表现为白屏、截图占位等问题。需要建立一套“真实可用”的端到端验收标准，并保证默认行为不再静默降级为模拟数据。

## What Changes
- 移除“CI=true 自动启用 mock 截图”的默认行为，mock 仅允许显式开启（配置项/环境变量）
- 在本地与 CI 验证链路中强制使用真实 Playwright Chromium 进行截图（需要安装浏览器）
- 增强启动/运行时诊断：当 Playwright 浏览器不可用时给出明确错误与修复指引，而不是白屏/沉默失败
- 新增真实 e2e 验收用例：启动 server + web + 一个本地静态站点，跑一次任务并获取真实截图（非 1x1 占位）

## Impact
- Affected specs: Web 模式可运行、Pipeline 可跑通、BrowserPool 并发控制、测试与验证
- Affected code:
  - packages/browser-pool（截图策略、默认行为、错误提示）
  - packages/pipeline、apps/server（e2e 真实链路依赖）
  - README（补充 Playwright 安装步骤与常见问题）
  - 测试用例（server e2e / pipeline test 等）

## ADDED Requirements
### Requirement: 默认不使用模拟截图
系统 SHALL 默认使用真实 Playwright 进行截图。

#### Scenario: 默认运行
- **WHEN** 用户执行 `pnpm dev:server` 并通过 Web 控制台启动任务
- **THEN** 任务产出物中的截图为真实页面截图（非 1x1 占位 PNG），且可通过 `/artifacts/...` 访问

### Requirement: mock 仅允许显式启用
系统 SHALL 仅在用户显式声明时允许使用 mock 截图能力（例如配置项或环境变量）。

#### Scenario: 显式 mock
- **WHEN** 用户设置 `AUTOBS_BROWSER_MOCK=true`（或等价配置）并启动 server
- **THEN** BrowserPool 使用 mock 截图（用于离线/无浏览器环境），且 UI/日志明确标识已启用 mock

### Requirement: Playwright 依赖可诊断
系统 SHALL 在 Playwright Chromium 不可用时提供可操作的诊断信息。

#### Scenario: 浏览器未安装
- **WHEN** Chromium 未安装或缺少运行依赖导致启动失败
- **THEN** 服务端日志与 API 错误响应包含明确提示（例如建议执行 `pnpm exec playwright install chromium`），且前端不会白屏而是展示错误信息

### Requirement: 真实 e2e 验收
系统 SHALL 提供一条真实端到端验收链路，不依赖外网与模拟数据。

#### Scenario: 本地静态站点 e2e
- **GIVEN** 启动一个本地静态 HTTP 服务（提供固定页面）
- **WHEN** 创建项目与页面并启动任务
- **THEN** 任务完成且生成截图文件，截图文件尺寸大于最小阈值且可被解析为 PNG

## MODIFIED Requirements
### Requirement: 测试与验证策略
系统 SHALL 在 CI 中执行真实截图的 e2e 验收，并在 CI 脚本中包含 Playwright 浏览器安装步骤。

## REMOVED Requirements
### Requirement: CI 自动 mock 截图
**Reason**: 自动 mock 会掩盖真实运行问题，与“系统真实可用”目标冲突。
**Migration**: 改为显式开关 `AUTOBS_BROWSER_MOCK=true`；CI 默认关闭 mock 并安装 Chromium。
