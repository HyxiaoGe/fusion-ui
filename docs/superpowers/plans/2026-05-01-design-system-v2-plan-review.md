# Design System v2 Plan Review

Review target: `docs/superpowers/plans/2026-04-30-design-system-v2.md`

Review date: 2026-05-01

Purpose: 这份文档只审视原实施计划本身的可执行性、与当前 `fusion-ui` 代码的一致性、风险控制是否充分。不推进实现，不替代原计划。

## Summary

原计划的总体方向是合理的：按 token → layout → composer → message → sources/model/home 的顺序推进，且多次强调不碰 Redux、API、流式、上传、Agent 等业务链路。这些边界是正确的。

但当前计划还不适合直接交给 agent 执行。主要问题集中在四类：

- 部分 Tailwind utility 在计划中被使用，但 Phase 0 没有桥接生成。
- 部分步骤与当前代码不一致，会导致 agent 找错位置或实现不存在的功能。
- 个别设计目标和红线互相冲突，例如 `pending` status。
- 回滚和验证命令有误伤或不可重复执行风险。

建议先修正文档，再进入任何实现阶段。

## Blockers

### 1. Tailwind token bridge 不完整

**问题**

Phase 0 只桥接了 `theme.extend.colors`，但后续 phase 使用了并未配置的 Tailwind utility：

- `text-md`
- `duration-fast`
- `shadow-xs` / `shadow-popover` 等潜在 shadow token
- 可能的 spacing token class

CSS variable 存在不代表 Tailwind v3 会自动生成 utility。当前计划会让后续 className 里出现无效 class，视觉不会按预期生效。

**证据**

原计划 Phase 0 只要求在 `tailwind.config.js` 中追加 colors。后续 Phase 2 示例使用：

```tsx
className="block w-full resize-none outline-none px-3 py-2.5 text-md
           bg-bg-elevated border border-border rounded-md
           focus:border-border-strong transition-colors duration-fast
           dark:bg-muted dark:border-border-strong
           placeholder:text-muted-foreground
           min-h-[44px]"
```

**影响**

- `text-md`、`duration-fast` 等 class 可能完全不生效。
- agent 会以为 token 已落地，实际视觉对齐失败但 build 不一定报错。

**建议**

Phase 0 增加完整桥接，至少包括：

```js
fontSize: {
  '2xs': 'var(--text-2xs)',
  xs: 'var(--text-xs)',
  sm: 'var(--text-sm)',
  'base-fdv2': 'var(--text-base-fdv2)',
  md: 'var(--text-md)',
  lg: 'var(--text-lg)',
  xl: 'var(--text-xl)',
  '2xl': 'var(--text-2xl)',
  '3xl': 'var(--text-3xl)',
},
transitionDuration: {
  fast: 'var(--duration-fast)',
  base: 'var(--duration-base)',
  slow: 'var(--duration-slow)',
},
transitionTimingFunction: {
  standard: 'var(--ease-standard)',
  'out-fdv2': 'var(--ease-out-fdv2)',
},
boxShadow: {
  xs: 'var(--shadow-xs)',
  'sm-fdv2': 'var(--shadow-sm-fdv2)',
  'md-fdv2': 'var(--shadow-md-fdv2)',
  'lg-fdv2': 'var(--shadow-lg-fdv2)',
  popover: 'var(--shadow-popover)',
},
```

如果不想扩展 Tailwind，后续步骤应全部改成现有 utility 或 arbitrary value，例如 `text-[14px]`、`duration-[120ms]`。

### 2. “纯 additive / 零视觉回归” 和暗色 token 校准互相矛盾

**问题**

计划多处强调 Phase 0 是 additive、零视觉变化。但 Phase 0.2 要修改现有 `.dark` token：

- `--muted`
- `--muted-foreground`
- `--border`

这些 token 已被现有组件大量使用，暗色 UI 一定会变化。

**影响**

- 验收标准写成“完全一致”会误导执行者。
- 视觉 diff 出现变化时，无法判断是预期变化还是回归。

**建议**

拆成两个任务：

- Phase 0a: Additive tokens only。要求截图完全一致。
- Phase 0b: Dark contrast calibration。明确这是有意视觉变化，验收标准改为“只允许 muted / border / secondary text 对比度变化，不允许布局和组件状态变化”。

同时将原文 “纯 additive，零组件改动，零视觉回归” 改成更准确的：

> Token 新增是 additive；暗色现有 token 校准是 intentional visual change。

### 3. Phase 2 和当前 `ChatInput` 代码不一致

**问题**

计划要求用：

```bash
grep -n "<textarea" src/components/chat/ChatInput.tsx
```

但当前代码使用的是 shadcn `Textarea` 组件：

```tsx
<Textarea
  id="chat-message-input"
  ...
/>
```

另外计划多次提到 “深度搜索开关”，但当前 `ChatInput` 里只有：

- 文件上传按钮
- 思考按钮
- ModelSelector
- 发送 / 停止按钮

没有独立的“深度搜索”按钮。

**影响**

- 执行者会找不到计划中的元素。
- 可能为了满足计划误加业务功能，违反“仅视觉层”的红线。

**建议**

Phase 2 改为基于当前真实代码定位：

- 搜 `id="chat-message-input"` 或 `<Textarea`。
- 工具按钮清单改成：附件、思考、模型选择、发送/停止。
- 删除 “深度搜索开关” 的 active 态和端到端验证步骤，除非先明确它是一个新功能需求。

### 4. `AgentStepCard` 的 `pending` status 与类型红线冲突

**问题**

计划要求新增 `pending` status 渲染：

```tsx
agentStep.status === 'pending'
```

但当前 `AgentStep` 类型是：

```ts
export interface AgentStep {
  step: number;
  status: 'running' | 'completed';
  toolCalls: AgentToolCall[];
}
```

计划同时又写：

> 不动 AgentStep 类型定义

这是直接冲突。

**影响**

- TypeScript 构建会失败，或 `pending` 分支永远不可达。
- 如果强行改类型，又会越过原计划红线。

**建议**

二选一：

1. 保持视觉层：删除 pending status 相关要求，只 token 化 running / completed / failed tool call。
2. 接受行为模型扩展：新增一个独立 phase，明确修改 `streamSlice.ts` 的 `AgentStep` 类型和生成逻辑，并补测试。这样就不能再声称 “不动 AgentStep 类型定义”。

更保守建议采用方案 1。

### 5. Phase 3a 提到当前不存在的 “赞 / 踩”

**问题**

计划要求验证：

- 点赞
- 踩
- 反馈

当前 `ChatMessage` 操作区只有复制、重新生成、编辑、重试等，没有 thumbs up/down 反馈功能。

**影响**

- 验证步骤不可执行。
- 执行者可能误以为要新增反馈功能，超出视觉重构范围。

**建议**

删除 “赞 / 踩” 相关描述和验证步骤。操作按钮范围应改为：

- AI: 时间戳、复制、重新生成。
- User: 时间戳、编辑、重新发送。

### 6. Header system mode 推断不够稳

**问题**

计划在 render 阶段直接用 `window.matchMedia` 计算：

```tsx
const isDark = themeMode === 'dark' || (
  themeMode === 'system' &&
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-color-scheme: dark)').matches
);
```

这在客户端可运行，但存在两个缺口：

- 系统主题变化时图标不会自动刷新。
- 测试环境需要 mock `matchMedia`，否则 `system` 分支不可控。

**影响**

Header 图标可能和实际 DOM class 短暂或长期不同步，尤其在 `system` 模式下。

**建议**

复用已有 `ThemeToggle` 的 mounted 思路，或者新增小 hook：

```ts
function useResolvedTheme(mode: 'light' | 'dark' | 'system') {
  const [resolved, setResolved] = useState<'light' | 'dark'>('light');

  useEffect(() => {
    if (mode !== 'system') {
      setResolved(mode);
      return;
    }

    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const update = () => setResolved(media.matches ? 'dark' : 'light');
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, [mode]);

  return resolved;
}
```

然后 Header toggle 根据 resolved theme 切到 light/dark。

## High Risk Issues

### 7. Sidebar 目标和文件范围不匹配

**问题**

Phase 1b 的目标是 ChatSidebar 视觉对齐，但 red lines 又写不动：

- `ChatSidebarHeader`
- `ChatList`
- `RenameDialog`
- `DeleteDialog`

当前 sidebar 的实际视觉大量分布在 `ChatSidebarHeader`、`ChatList`、`ChatItem` 等子组件里，只改 `ChatSidebar.tsx` 很难达成“整体视觉对齐”。

**影响**

- 验收标准和实际改动范围不一致。
- 后续可能出现 “明明按计划改了，但 sidebar 仍不对齐”。

**建议**

改成其中一种：

- 保守版：Phase 1b 只修 `ResizableSidebar` 和 `ChatSidebar` 容器 / 搜索框，不声称完整 sidebar 视觉对齐。
- 完整版：把 `ChatSidebarHeader.tsx`、`ChatList.tsx`、`ChatItem.tsx` 纳入文件清单和 red line 豁免。

### 8. `ReasoningContent` 的 “无 CLS” 表述过强

**问题**

从 `max-height` 改成 `grid-template-rows` 可以减少硬截断，但展开内容从 0 到完整高度仍会推动页面布局变化。严格意义上，这不等于“无 CLS”，而是“更自然的可动画展开”。

**影响**

验收时容易误判。特别是 chat 滚动容器中，任何展开/流式增长都会影响 scroll height。

**建议**

把描述改成：

> 修复 200px 固定高度导致的截断；改为 grid rows 动画，使展开高度自适应，并重点回归 scroll-stick。

不要写 “无 CLS” 作为绝对承诺。

### 9. SourcesSidebar 分组需求没有数据支撑

**问题**

计划说 `SourcesSidebar` 新增按 `section` 分组，但当前 `SearchSourceSummary` 类型只有：

```ts
export interface SearchSourceSummary {
  title: string;
  url: string;
  favicon?: string;
}
```

没有 `section` 字段。

计划后面虽然写了 “如果没有 section 字段就不强加分组”，但前面的 phase goal 和 commit message 仍声称新增分组。

**影响**

- 文档目标不稳定。
- commit message 可能描述了未发生的事情。

**建议**

Phase 3d 目标改成：

> SourcesSidebar 宽度 360 → 400px；如未来数据提供 section，再启用分组。本次不改类型、不造分组数据。

commit message 删除 “官方文档/参考案例” 等没有数据来源的描述。

### 10. `ChatInput` textarea 容器化可能破坏现有 composer 结构

**问题**

当前 `ChatInput` 是一个外层 rounded card，内部含文件预览、Textarea、toolbar。计划建议给 Textarea 自己加 `border rounded-md bg-bg-elevated`，这会变成卡片里再套输入框。未必错，但它改变了 composer 的结构密度。

**影响**

- 文件预览、toolbar、textarea 三块视觉可能割裂。
- 暗色对比解决了，但整体 composer 可能不像 prototype。

**建议**

先明确 prototype 目标是：

- 整个 composer 是一个统一容器，textarea transparent；
- 还是 textarea 是独立输入框，toolbar 在外。

如果保持当前结构，建议只加强外层 composer 的 `bg` / `border` / focus ring，而不是给 Textarea 再加完整边框。

## Medium Risk Issues

### 11. 手动截图和 `kill %1` 不够可重复

**问题**

计划多处用：

```bash
npm run dev:next &
sleep 15
kill %1
```

在非交互 shell、agent session 或已有 dev server 的情况下，`%1` 不稳定。

**建议**

改为：

```bash
npm run dev:next
```

让执行者保留 session id；或使用 PID 文件：

```bash
npm run dev:next > /tmp/fusion-ui-next.log 2>&1 &
echo $! > /tmp/fusion-ui-next.pid
kill "$(cat /tmp/fusion-ui-next.pid)"
```

### 12. 基线安装建议用 `npm ci`

**问题**

Pre-flight 使用 `npm install`，可能修改 lockfile 或安装到和 CI 不完全一致的依赖。

**建议**

如果 `package-lock.json` 已存在，基线步骤改用：

```bash
npm ci
```

### 13. 测试失败处理表述过于宽松

**问题**

文档写：

> 如果是 className 字符串断言，那是测试需要更新

这句话容易被误用。className 断言失败有时也可能说明视觉 token 没按预期应用。

**建议**

改成：

> 如果测试只断言旧 className，且人工确认新视觉符合计划，可以更新测试；否则先排查实现。

### 14. 回滚策略使用 `git reset --hard` 有误伤风险

**问题**

失败处理总规则建议：

```bash
git reset --hard HEAD~N
```

这会丢掉未提交改动，尤其在用户或其他 agent 同时改动时风险很高。

**建议**

改为：

- 已提交 phase：用 `git revert`。
- 未提交改动：先 `git status` 和 `git diff`，只恢复本 phase 相关文件。
- 不要在通用失败处理里建议 `reset --hard`。

### 15. 自检清单与正文不完全一致

**问题**

Self-review 写：

- No placeholders
- Type consistency
- Rollback 单命令

但正文存在：

- `<填实际的 main HEAD>` 占位符。
- `pending` status 与 `AgentStep` 类型不一致。
- 失败处理建议 `git reset --hard`，不是每个情况都能安全 revert。

**建议**

修正文档后再更新 self-review，避免自检项给出错误信号。

## Low Risk / Cleanup

### 16. Commit message 中的 Co-Authored-By 不应硬编码

**问题**

每个 commit message 都硬编码：

```text
Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

这和实际执行 agent 未必一致，也可能污染提交历史。

**建议**

删除固定 co-author，或改成“如团队规范需要，再添加 co-author”。

### 17. Summary 文档创建步骤不适合直接写 heredoc

**问题**

Phase 6 用：

```bash
cat > docs/superpowers/plans/2026-04-30-design-system-v2-summary.md <<'EOF'
```

这会直接覆盖文件，不利于审查，也不符合常规代码编辑流程。

**建议**

改成：

> 新建总结文档，模板如下。

由执行者用正常编辑工具创建。

### 18. `SourcesPanel` label 可能与已有“参考资料入口”重复

**问题**

`ChatMessage` 里完成态已有：

```tsx
参考 {searchSources.length} 篇资料
```

计划又让 `SourcesPanel` label 变成：

```tsx
参考 {sources.length} 篇资料
```

**影响**

消息里可能出现两个含义接近的“参考 N 篇资料”入口，一个是 pill row label，一个是打开 sidebar 的 button。

**建议**

明确两者职责：

- `SourcesPanel`: 行内来源 pill，只显示 “来源” 或不显示总数。
- sidebar trigger: 显示 “参考 N 篇资料”。

### 19. `HomePage` 去掉 shadow 的视觉目标需要再确认

**问题**

Plan 说 HomePage 现有 wave-flip 已经对齐 prototype，但 Phase 5 又删除 pill shadow，改为 hairline border。这可能与 prototype 不一致。

**建议**

如果 prototype pill 有明显浮层感，保留轻 shadow 并走 `shadow-xs` / `shadow-sm-fdv2`；如果 design system 明确偏 flat，再删除 shadow。文档需要说明依据。

## Suggested Rewrite Plan

建议先把原计划按下面方式修订：

1. Phase 0 拆成 0a additive token 和 0b dark calibration。
2. Phase 0 明确补齐 Tailwind bridge，或删除后续未桥接 class。
3. Phase 1a Header 补 resolved theme hook / system mode 测试策略。
4. Phase 1b 明确 sidebar 子组件是否纳入范围。
5. Phase 2 删除不存在的深度搜索按钮，定位改为当前 `Textarea` 组件。
6. Phase 3a 删除赞踩相关步骤。
7. Phase 3c 删除 pending status，除非愿意扩展 `AgentStep` 类型和 stream 逻辑。
8. Phase 3d 把分组改成 future-ready，不把没有数据字段的功能写成必做。
9. 全文回滚策略移除 `git reset --hard`。
10. 更新 self-review，让它真实反映文档现状。

## Recommended Acceptance Criteria For The Revised Plan

修订后的计划应满足：

- 每一个 className 使用的 Tailwind utility 都能由当前 Tailwind 配置生成。
- 每一个定位命令都能在当前代码中找到目标。
- 每一个验收步骤对应当前真实存在的功能。
- 每一处“红线”都不被后续任务打破。
- 每个 phase 的回滚方式不会丢失用户未提交改动。
- Phase 0 的视觉变化预期被准确描述。
