# Design System V2 后续待办

**上下文**：V2 主体已于 2026-05-03 合并到 master（merge commit `c8138da`），CI/CD 同步切到 GHCR 镜像架构。本文档记录 V2 期间明确划在范围外、或需要等真实使用反馈再判断的事项。

按"启动门槛"分三类，将来按当时心情挑。

---

## A. Polish（等真实使用反馈，被动响应）

**触发方式**：用 dev 几天后，遇到具体不顺手的地方，单 commit 修，不预先排。

可能出现的方向（举例，不是清单）：

- **色值微调**：暗色下某个 token 看着太重/太淡（例如 `--info-border` / `--muted` / `--border` 的 oklch 值）
- **引用徽章交互手感**：scrollIntoView `block` 参数（center vs start）、高亮持续时长、连续点同号是否需要小动效
- **侧边栏宽度**：v2 默认改到 320px，实际用着觉得挤可以下调
- **Sun/Moon 按钮位置**：放 ChatSidebar 底部用着找不到可以重排
- **间距/留白**：AgentStep 步骤行 `space-y-1.5`、ChatMessage 操作栏 `gap` 等
- **复制成功反馈时长**：当前 1.5s 重置，可能需要更长/更短

**判定标准**：你/真实用户主动说"这里看着不对"才动，不主动猜。

---

## B. 范围外功能扩展（主动开新项目）

每条都需要单独立项 + brainstorming + plan。

### B0. ~~全量对话搜索 MVP~~ ✅ 已完成（2026-05-03）
作为 sidebar 加载/刷新机制重构 PR 一并落地，merge commit `d50c02e`：
- 后端：`GET /api/chat/conversations/search?q=...&limit=50` + `GET /api/chat/conversations/metadata?ids=...`
- 前端：debounce 300ms 调后端，搜索全量结果
- 进阶版（搜消息内容）仍待用户反馈触发，未立项

### B1. AgentStep `pending` status
- **现状**：`AgentStep.status` 类型只有 `'running' | 'completed'`，AgentStepCard 没有"已发起未执行"视觉
- **改动**：streamSlice 类型扩展 + fusion-api 的 stream payload 要发 pending 事件 + AgentStepCard 渲染 pending 视觉
- **触发条件**：当 step 从发起到真正开始执行有可感知延迟、用户感觉"卡住了"时再做
- **跨项目**：是

### B2. ModelSelector Popover 内部视觉重构
- **现状**：V2 phase 4 只改了 trigger，Popover 打开后展示的"模型列表面板"完全没动（`ModelSelectorPanel.tsx` 207 行硬编码 0 处但视觉是旧设计）
- **改动**：模型卡片重新设计（分组、icon、当前选中态、搜索框样式等）
- **触发条件**：模型数量增加到列表难浏览时，或者新增模型分类（按厂商/能力）需求时
- **跨项目**：否

### B3. ChatMessage thumbs up/down 反馈
- **现状**：功能本身不存在
- **改动**：UI（按钮 + 状态）+ 后端反馈表 + 反馈写入 API + 后续如何用反馈数据
- **触发条件**：想做对话质量分析时
- **跨项目**：是

### B4. SourcesSidebar 按 section 分组（**ROI 偏低，可无限期搁置**）
- **现状**：sources 平铺渲染
- **改动**：`SearchSourceSummary` 加 `section` 字段 + 后端搜索结果归类（或前端 heuristic）+ sidebar 按 section group 渲染
- **为什么 ROI 低**：sources 通常不超过 10 条，分组反而打散视觉
- **触发条件**：sources 数量稳定 > 15 条且用户反映难找时

---

## C. 技术债 / 基础设施清理

### C1. ChatItem.tsx hover overlay token 化（**1 行**）
- **现状**：`src/components/chat/sidebar/ChatItem.tsx:64` 用 `hover:bg-black/5 dark:hover:bg-white/10`
- **改动**：换成 `hover:bg-muted`
- **触发条件**：顺手 commit 时带上，或者下次有 ChatSidebar 子组件改动时一起做

### C2. SuggestedQuestions `globalThis.triggerLoginDialog` 重构（架构债）
- **现状**：通过 `globalThis` 全局触发登录 dialog，跨组件耦合
- **改动**：改用 Redux action 或 Context 暴露，去除 globalThis 依赖
- **触发条件**：登录流程要扩展（多 provider、SSO 等）时一起做

### C3. highlight.js → Shiki 迁移
- **现状**：CodeBlock 用 highlight.js，prototype 阶段曾考虑切 Shiki 被 D3 决策保留
- **改动**：换 tokenizer + 验证 SSR + 视觉对齐
- **触发条件**：当前 highlight.js 主题难调或包体积成为问题时

### C4. baseline 22 个 vitest mock 失败
- **现状**：22 个测试在 vitest 环境下因 `await import()` 动态 import 的 mock setup 问题失败，独立于业务代码
- **改动**：升级 vitest 配置 / 改写测试为静态 import / 或用 vi.mock 替代 await import
- **触发条件**：要往 CI 加测试门禁（test must pass）时必须先解决

### C5. 老 `deploy.yml` 最终去留
- **现状**：保留 `workflow_dispatch` 入口作 GHCR 故障应急
- **决策点**：跑半年观察，如果从未用过应急入口就可以删；如果偶尔用过说明价值确认，永久保留

---

## 索引（给未来翻 plan 目录的人）

- V2 完整总结：`2026-05-01-design-system-v2-summary.md`
- V2 实施计划：`2026-05-01-design-system-v2.md`
- 本文档：后续待办 + polish 收件箱
