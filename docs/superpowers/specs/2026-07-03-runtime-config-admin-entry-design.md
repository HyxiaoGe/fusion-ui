# Runtime Config 管理入口 v1 设计

## 背景

`fusion-api` 已提供运行时配置治理接口：可查看快照、校验候选 payload、创建 inactive 候选版本、安全激活版本、禁用坏版本。当前缺口在 `fusion-ui`：管理员仍需要手动调 API，无法在产品内完成配置发布闭环。

## 目标

v1 在现有设置入口中增加管理员可见的“运行时配置”页签：

1. 展示当前 effective 配置，包含 `namespace/key`、来源、版本、校验状态、跳过版本和问题。
2. 展示数据库版本列表，区分 active、inactive、invalid、disabled，并显示描述和更新时间。
3. 支持创建候选版本：填写 `namespace`、`key`、`version`、`description` 和 JSON payload；点击创建时先调用 validate，通过后再 create，写入后默认不生效。
4. 支持显式校验候选 payload，展示校验结果和 issues。
5. 支持激活版本：需要二次确认，调用 activate；激活成功后刷新快照。
6. 支持禁用 active 版本：需要二次确认，调用 status=false；禁用成功后刷新快照。
7. 普通用户不展示入口；管理员入口同时覆盖 `/settings` 页面和头像设置弹窗。

## 非目标

- 不做复杂 JSON 编辑器、diff、版本回滚向导或 PromptHub 迁移。
- 不做角色权限管理；只沿用现有 `is_superuser` 和后端鉴权。
- 不新增本地缓存；配置管理应每次进入或操作后读取最新状态。
- 不改变后端 API、SSE 协议或模型列表结构。

## 信息架构

入口位置：

- `/settings` 页面：管理员看到第 4 个页签“运行时配置”。
- `SettingsDialog`：管理员看到第 4 个页签“运行时配置”。
- 非管理员如果有残留 active tab 状态，应回退到常规设置。

页面内容：

1. 顶部状态栏：刷新按钮、effective 数量、版本数量、异常数量。
2. 创建候选版本表单：基础字段 + payload textarea + 校验/创建按钮。
3. 当前生效配置列表：按 `namespace/key` 展示当前来源、版本和校验状态。
4. 版本列表：按 `namespace/key/version` 展示状态和操作按钮。

## 交互和错误处理

- 加载中显示紧凑 loading 状态；加载失败显示错误和重试按钮。
- payload 必须是合法 JSON object；前端解析失败时不发请求。
- 创建候选版本时总是先 validate；validate 失败不调用 create。
- create、activate、disable 成功后刷新 snapshot，并清空或更新对应状态。
- API 错误展示后端 message；保留 request id 由全局错误模型承接，不在普通 UI 暴露底层服务名。

## 测试

- API client 测试覆盖 5 个接口的 method、URL、body。
- `RuntimeConfigManager` 组件测试覆盖加载、校验失败、validate 后创建、激活确认、禁用确认、错误重试。
- `SettingsPage` 和 `SettingsDialog` 测试覆盖管理员页签可见、普通用户不可见、残留 tab 回退。
- 构建验证覆盖 Next.js route 和组件类型。
