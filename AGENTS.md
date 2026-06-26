# AGENTS.md — fusion-ui 导航文件

## 语言

所有回复、注释、提交信息使用中文。Git 提交格式：`<type>: <中文描述>`，必须包含 `Co-Authored-By: Codex <noreply@anthropic.com>`。

## 快速命令

以下启动命令仅供人工本地开发参考。AI 协作者默认不得启动本地 Fusion 服务；调查、验收优先使用测试、构建、CI、远端 dev 状态、已有运行服务和用户已登录的 Chrome。

```bash
npm install                         # 安装依赖
npm run dev:next                    # Web 开发服务器（AI 默认不得启动）
npm test                            # 运行 Vitest
npm run build                       # Next.js 生产构建
```

## 架构速览

前端基于 Next.js 15、React 19 和 Electron。核心边界：

- `src/app/`：路由入口与页面装配
- `src/components/chat/`：对话主界面、消息、联网依据、工具过程与输入框
- `src/lib/`：API 客户端、数据转换、agent/tool 派生逻辑
- `src/redux/`：会话、消息、stream 状态管理
- `src/types/`：跨层协议类型

详细约束参考：

| 文档 | 内容 |
|------|------|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | 前端架构与关键模块 |
| [docs/ARCHITECTURE_RULES.md](docs/ARCHITECTURE_RULES.md) | 模块边界、状态与数据流约束 |
| [docs/CODING_CONVENTIONS.md](docs/CODING_CONVENTIONS.md) | 编码风格、组件与测试约定 |
| [CHAT_UI_DATA_FLOW.md](CHAT_UI_DATA_FLOW.md) | 聊天 UI 数据流 |

## 工作流程

1. **默认执行闭环**：用户说“开始”“继续”“修下”“按你说的来”“提交/部署”等，视为授权继续完成实现、验证、提交、push 和 CI/CD 跟踪；不要为常规下一步反复等待确认。
2. **先定位根因**：UI 卡顿、状态错乱、联网依据展示异常、CI 失败等问题，先读组件数据流、Redux 状态、测试、远端现象或用户提供的 Chrome 状态，确认根因后再改。
3. **复杂变更先计划**：多组件、多状态层、交互/视觉层级、前后端协议变化先写简短 implementation plan；必要时更新既有 spec。
4. **默认 Subagent-Driven**：适合拆分的开发任务默认用 Subagent-Driven；主 Agent 负责拆分、协调、复核，子 Agent 负责独立实现/审查。若工具额度或任务规模不适合启用，需说明原因并按同等 checklist 自审。
5. **TDD 优先**：bugfix 和行为变更先补能失败的回归测试，再实现。UI 改动优先覆盖派生模型、组件渲染和关键交互。
6. **编码中**：遵守前端架构和编码约定，优先复用现有组件、hooks、派生模型和样式 token；保持改动范围最小，不回滚无关用户改动。
7. **禁止默认本地启动**：不得为调查或验收启动 `npm run dev*`、`next dev`、Electron 或本地 Docker；优先使用 `npm test`、`npm run build`、CI、远端 dev 和用户已登录 Chrome。只有用户明确要求本地启动时才可执行。
8. **变更后验证**：运行与改动匹配的 Vitest；涉及路由、构建、样式或跨组件协议时运行 `npm run build`。不能只凭代码阅读声称完成。
9. **CI/CD 收尾**：按正常 Git 流程中文提交并包含 `Co-Authored-By`，push 后持续监控 GitHub Actions 和 dev 部署；失败时拉日志定位并修复。

## UI/UX 约束

- 优先减少空白时间、提升真实内容出现速度，不用骨架屏掩盖慢路径。
- 桌面 Web 优先；除非用户要求，不默认扩展移动端。
- 聊天正文永远是主角；思考、工具、来源、推荐问题等辅助层必须低干扰。
- 联网来源、诊断和工具过程面向普通用户时只展示用户可理解的信息；内部原因、预算、服务名、底层错误码只保留在日志或管理员/调试路径。
