# Tasks
- [x] Task 1: 明确并实现“默认真实截图、显式才允许 mock”的运行策略
  - [x] 移除 CI=true 自动 mock 的默认逻辑，新增显式开关（例如 AUTOBS_BROWSER_MOCK）
  - [x] 当启用 mock 时，在日志与 API（或 UI）中明确标识已启用 mock

- [x] Task 2: 增强 Playwright 依赖诊断与错误呈现
  - [x] BrowserPool 捕获浏览器启动/截图失败时输出可操作提示（安装命令/依赖提示）
  - [x] Web UI 对 API 错误做“非白屏”展示（统一错误提示区/空状态）

- [x] Task 3: 构建真实 e2e 验收（离线、可重复）
  - [x] 增加一个测试用本地静态站点（或在测试中临时启动静态服务器）
  - [x] 新增/改造 e2e：创建项目 → 添加页面 → 跑任务 → 校验 artifacts 中截图为真实 PNG（非 1x1 占位）

- [x] Task 4: CI/README 工作流更新
  - [x] 在 README 增加 Playwright 安装步骤与常见问题排查（缺少依赖/无头运行）
  - [x] 在 CI 测试脚本中增加 `pnpm exec playwright install chromium`（或等价方式）

# Task Dependencies
- Task 2 depends on Task 1
- Task 3 depends on Task 1
- Task 4 depends on Task 3
