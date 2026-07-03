# 模型选择器 UI 重设计

## 目标

优化输入框旁模型选择器的 UI/UX：加入 provider 标签页、最近使用快捷入口、触发器美化、整体视觉升级。API 和数据层不变，纯前端改动。

## 设计决策

| 决策 | 结果 |
|------|------|
| 面板布局 | 横向标签页 + 双列网格（方案 A） |
| 触发器样式 | 双行按钮：模型名 + provider 名小字（方案 B） |
| Provider 导航 | 横向可滚动标签页，无"全部"标签，默认激活当前模型的 provider |
| 最近使用 | chip 形式置顶，带 provider 图标，最多 3 个 |

## 触发器（ModelSelectorTrigger）

**当前**：胶囊按钮，16px provider 图标 + 截断模型名 + chevron

**改为**：
- 圆角矩形（`rounded-lg`），非胶囊
- 左侧 22px 方形 provider 图标（`rounded-md`）
- 右侧双行文字：上方模型名（`font-semibold text-xs`），下方 provider 显示名（`text-muted-foreground` 9px）
- 右侧 chevron 图标
- hover/open 状态：背景色变化 + 边框高亮

## 面板（ModelSelectorPanel）

面板从上到下分三个区域：

### 1. 最近使用区域

- 标题：「最近使用」，`text-[10px] uppercase tracking-wide text-muted-foreground`
- 内容：横向排列的 chip，每个 chip 包含 18px 方形 provider 图标 + 模型名
- 最多显示 3 个
- 点击 chip 直接选择模型并关闭面板
- 选中状态的 chip 使用 primary 色背景
- 存储：`localStorage` key `recentModels`，数组格式 `["model-id-1", "model-id-2", ...]`
- 每次选择模型时更新：移到数组头部，超过 3 个时丢弃末尾

### 2. Provider 标签页

- 横向排列，`overflow-x-auto` 可滚动
- 整体背景 `bg-muted/50`，上下有 border
- 当前激活标签：`text-primary font-semibold`，底部 2px `border-primary`，背景色 `bg-popover`
- 非激活标签：`text-muted-foreground`，hover 时变色
- 标签文字为 provider 显示名（从 Redux `providers` 列表获取）
- 标签排序：按 providers API 返回的 order 字段
- **默认激活**：当前选中模型所属的 provider

### 3. 模型网格

- `grid grid-cols-1 sm:grid-cols-2 gap-1.5 p-2.5`
- 每张卡片：`p-2.5 rounded-lg border transition-colors cursor-pointer`
- 卡片内容：模型名（`text-sm font-medium`）+ 能力标签列表（复用现有 CapabilityChipList）
- **选中状态**：`border-primary/50 bg-primary/5`，右上角显示 checkmark icon（`text-primary`）
- **hover 状态**：`hover:bg-accent hover:border-border`
- 只显示当前激活 provider 下的模型

## 组件变更

| 组件 | 变更 |
|------|------|
| `ModelSelectorTrigger.tsx` | 重写布局为双行按钮，增大图标，添加 provider 名 |
| `ModelSelectorPanel.tsx` | 拆为三区域：RecentModels + ProviderTabs + ModelGrid |
| `ModelSelector.tsx` | 新增 `activeProvider` 状态管理，新增最近使用的读写逻辑 |
| `CapabilityChip.tsx` | 不变 |
| `ProviderIcon.tsx` | 不变 |

## 新增逻辑

### 最近使用模型管理

```typescript
// 读取
const getRecentModels = (): string[] => {
  const raw = localStorage.getItem("recentModels");
  return raw ? JSON.parse(raw) : [];
};

// 更新（选择模型时调用）
const addRecentModel = (modelId: string) => {
  const recent = getRecentModels().filter(id => id !== modelId);
  recent.unshift(modelId);
  localStorage.setItem("recentModels", JSON.stringify(recent.slice(0, 3)));
};
```

### Provider 标签页状态

```typescript
// 在 ModelSelector 中管理
const [activeProvider, setActiveProvider] = useState<string>(() => {
  // 默认为当前选中模型的 provider
  const currentModel = models.find(m => m.id === currentModelId);
  return currentModel?.provider || providers[0]?.id || "";
});

// 切换标签页时
const handleProviderChange = (providerId: string) => {
  setActiveProvider(providerId);
};

// 筛选当前 provider 的模型
const filteredModels = groupedModels[activeProvider] || [];
```

## 响应式

- 移动端：面板宽度 `w-[calc(100vw-32px)]`，模型网格单列
- 桌面端：面板宽度 `sm:w-[480px]`（从 440px 增加），模型网格双列
- 标签页横向滚动，不换行
- 最近使用 chips 如果超宽则 `flex-wrap`

## 深色模式

使用项目已有的 CSS 变量（`--primary`、`--accent`、`--border`、`--muted-foreground` 等），无需额外定义颜色。选中卡片的渐变背景改用 `bg-primary/5`。

## 不变的部分

- API 数据层、Redux 状态管理、模型选择逻辑、会话绑定逻辑均不变
- CapabilityChip 和 ProviderIcon 组件不变
- 模型不可用时的提示逻辑不变
- Popover 配置（side="top", align="start", avoidCollisions）不变
