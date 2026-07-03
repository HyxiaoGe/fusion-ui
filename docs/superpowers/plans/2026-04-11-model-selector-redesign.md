# 模型选择器 UI 重设计 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 重设计模型选择器的触发器和面板，加入 provider 标签页、最近使用、视觉升级。

**Architecture:** 修改 3 个现有组件（ModelSelectorTrigger、ModelSelectorPanel、ModelSelector），新增 1 个工具模块（recentModels）。触发器改为双行按钮，面板拆为三区域（最近使用 + provider 标签页 + 模型网格）。数据层和 Redux 不变。

**Tech Stack:** React 19, Next.js 15, Tailwind CSS, Radix UI Popover, lucide-react

---

## 文件变更清单

| 操作 | 文件 | 职责 |
|------|------|------|
| 创建 | `src/lib/models/recentModels.ts` | 最近使用模型的 localStorage 读写 |
| 修改 | `src/components/models/ModelSelectorTrigger.tsx` | 双行按钮样式 |
| 修改 | `src/components/models/ModelSelectorPanel.tsx` | 三区域布局：最近使用 + 标签页 + 网格 |
| 修改 | `src/components/models/ModelSelector.tsx` | activeProvider 状态 + recentModels 集成 |

---

### Task 1: 最近使用模型工具模块

**Files:**
- Create: `src/lib/models/recentModels.ts`

- [ ] **Step 1: 创建 recentModels.ts**

```typescript
// src/lib/models/recentModels.ts

const STORAGE_KEY = "recentModels";
const MAX_RECENT = 3;

export function getRecentModels(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function addRecentModel(modelId: string): void {
  if (typeof window === "undefined") return;
  try {
    const recent = getRecentModels().filter((id) => id !== modelId);
    recent.unshift(modelId);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(recent.slice(0, MAX_RECENT)));
  } catch {
    // localStorage 不可用时静默失败
  }
}
```

- [ ] **Step 2: 提交**

```bash
git add src/lib/models/recentModels.ts
git commit -m "feat: 添加最近使用模型的 localStorage 工具模块"
```

---

### Task 2: 触发器重设计

**Files:**
- Modify: `src/components/models/ModelSelectorTrigger.tsx`

- [ ] **Step 1: 重写 ModelSelectorTrigger**

需要新增 `providers` prop 来获取 provider 显示名称。将整个文件替换为：

```tsx
import { forwardRef } from "react";
import { cn } from "@/lib/utils";
import { ChevronUp } from "lucide-react";
import ProviderIcon from "./ProviderIcon";
import type { ModelInfo, ProviderInfo } from "@/lib/config/modelConfig";

interface ModelSelectorTriggerProps {
  model: ModelInfo | null;
  providers: ProviderInfo[];
  isOpen: boolean;
  disabled: boolean;
  onClick?: () => void;
}

const ModelSelectorTrigger = forwardRef<HTMLButtonElement, ModelSelectorTriggerProps>(
  ({ model, providers, isOpen, disabled, ...props }, ref) => {
    const providerName = model
      ? providers.find((p) => p.id === model.provider)?.name || model.provider
      : "";

    return (
      <button
        ref={ref}
        disabled={disabled}
        className={cn(
          "inline-flex items-center gap-2 pl-1.5 pr-3 py-1 rounded-lg border text-xs transition-colors duration-150",
          "text-foreground",
          disabled
            ? "cursor-default opacity-60"
            : "cursor-pointer hover:bg-accent",
          isOpen ? "bg-accent border-primary/30" : "border-border",
        )}
        {...props}
      >
        {model ? (
          <>
            <ProviderIcon providerId={model.provider} size={22} className="rounded-md" />
            <div className="flex flex-col items-start leading-tight">
              <span className="font-semibold text-xs truncate max-w-[140px]">{model.name}</span>
              <span className="text-[9px] text-muted-foreground">{providerName}</span>
            </div>
          </>
        ) : (
          <span className="px-1">选择模型</span>
        )}
        <ChevronUp
          size={12}
          className={cn(
            "transition-transform duration-150 shrink-0 text-muted-foreground",
            isOpen ? "rotate-0" : "rotate-180",
          )}
        />
      </button>
    );
  },
);

ModelSelectorTrigger.displayName = "ModelSelectorTrigger";

export default ModelSelectorTrigger;
```

- [ ] **Step 2: 提交**

```bash
git add src/components/models/ModelSelectorTrigger.tsx
git commit -m "feat: 触发器改为双行按钮，显示模型名和 provider 名"
```

---

### Task 3: 面板重设计

**Files:**
- Modify: `src/components/models/ModelSelectorPanel.tsx`

- [ ] **Step 1: 重写 ModelSelectorPanel**

面板拆为三区域：RecentModels + ProviderTabs + ModelGrid。将整个文件替换为：

```tsx
import { memo } from "react";
import { cn } from "@/lib/utils";
import { Check } from "lucide-react";
import { CapabilityChipList } from "./CapabilityChip";
import ProviderIcon from "./ProviderIcon";
import type { ModelInfo, ProviderInfo } from "@/lib/config/modelConfig";

/* ---------- types ---------- */

interface ProviderGroup extends ProviderInfo {
  models: ModelInfo[];
}

interface ModelSelectorPanelProps {
  modelsByProvider: ProviderGroup[];
  selectedModelId: string | null;
  recentModelIds: string[];
  allModels: ModelInfo[];
  activeProvider: string;
  onSelect: (modelId: string) => void;
  onProviderChange: (providerId: string) => void;
}

/* ---------- RecentModels ---------- */

const RecentModels = memo(
  ({
    modelIds,
    allModels,
    selectedModelId,
    onSelect,
  }: {
    modelIds: string[];
    allModels: ModelInfo[];
    selectedModelId: string | null;
    onSelect: (id: string) => void;
  }) => {
    const recentModels = modelIds
      .map((id) => allModels.find((m) => m.id === id))
      .filter((m): m is ModelInfo => m != null && m.enabled !== false);

    if (recentModels.length === 0) return null;

    return (
      <div className="px-3 pt-2.5 pb-1.5">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-1.5">
          最近使用
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {recentModels.map((model) => (
            <button
              key={model.id}
              onClick={() => onSelect(model.id)}
              className={cn(
                "inline-flex items-center gap-1.5 pl-1 pr-2.5 py-1 rounded-md border text-[11px] transition-colors",
                model.id === selectedModelId
                  ? "bg-primary/10 border-primary/30 text-foreground"
                  : "bg-muted/50 border-border text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              <ProviderIcon providerId={model.provider} size={18} className="rounded" />
              {model.name}
            </button>
          ))}
        </div>
      </div>
    );
  },
);
RecentModels.displayName = "RecentModels";

/* ---------- ProviderTabs ---------- */

const ProviderTabs = memo(
  ({
    providers,
    activeProvider,
    onProviderChange,
  }: {
    providers: ProviderGroup[];
    activeProvider: string;
    onProviderChange: (id: string) => void;
  }) => (
    <div className="flex border-y border-border bg-muted/30 overflow-x-auto">
      {providers.map((provider) => (
        <button
          key={provider.id}
          onClick={() => onProviderChange(provider.id)}
          className={cn(
            "px-3 py-2 text-[11px] whitespace-nowrap transition-colors shrink-0",
            provider.id === activeProvider
              ? "text-primary font-semibold border-b-2 border-primary bg-popover -mb-px"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {provider.name}
        </button>
      ))}
    </div>
  ),
);
ProviderTabs.displayName = "ProviderTabs";

/* ---------- ModelCard ---------- */

const ModelCard = memo(
  ({
    model,
    isSelected,
    onSelect,
  }: {
    model: ModelInfo;
    isSelected: boolean;
    onSelect: () => void;
  }) => (
    <button
      onClick={onSelect}
      className={cn(
        "text-left p-2.5 rounded-lg border transition-colors duration-100 w-full",
        isSelected
          ? "bg-primary/5 border-primary/40"
          : "border-border/60 hover:bg-accent hover:border-border",
      )}
    >
      <div className="flex items-center justify-between gap-1">
        <span className={cn("text-sm truncate", isSelected ? "font-semibold" : "font-medium")}>
          {model.name}
        </span>
        {isSelected && <Check size={14} className="shrink-0 text-primary" />}
      </div>
      <CapabilityChipList capabilities={model.capabilities} maxCount={4} />
    </button>
  ),
);
ModelCard.displayName = "ModelCard";

/* ---------- ModelSelectorPanel ---------- */

const ModelSelectorPanel = memo(
  ({
    modelsByProvider,
    selectedModelId,
    recentModelIds,
    allModels,
    activeProvider,
    onSelect,
    onProviderChange,
  }: ModelSelectorPanelProps) => {
    const activeGroup = modelsByProvider.find((g) => g.id === activeProvider);
    const filteredModels = activeGroup?.models || [];

    return (
      <div>
        <RecentModels
          modelIds={recentModelIds}
          allModels={allModels}
          selectedModelId={selectedModelId}
          onSelect={onSelect}
        />
        <ProviderTabs
          providers={modelsByProvider}
          activeProvider={activeProvider}
          onProviderChange={onProviderChange}
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 p-2.5">
          {filteredModels.map((model) => (
            <ModelCard
              key={model.id}
              model={model}
              isSelected={model.id === selectedModelId}
              onSelect={() => onSelect(model.id)}
            />
          ))}
        </div>
      </div>
    );
  },
);
ModelSelectorPanel.displayName = "ModelSelectorPanel";

export default ModelSelectorPanel;
```

- [ ] **Step 2: 提交**

```bash
git add src/components/models/ModelSelectorPanel.tsx
git commit -m "feat: 面板重设计为三区域布局（最近使用 + 标签页 + 网格）"
```

---

### Task 4: ModelSelector 编排层更新

**Files:**
- Modify: `src/components/models/ModelSelector.tsx`

- [ ] **Step 1: 重写 ModelSelector**

新增 `activeProvider` 状态管理和 `recentModels` 集成。将整个文件替换为：

```tsx
"use client";

import { useMemo, useState, useCallback } from "react";
import { usePathname } from "next/navigation";
import { useAppDispatch, useAppSelector } from "@/redux/hooks";
import { setSelectedModel } from "@/redux/slices/modelsSlice";
import { updateConversationModel } from "@/redux/slices/conversationSlice";
import { getPreferredModelId } from "@/lib/models/modelPreference";
import { getRecentModels, addRecentModel } from "@/lib/models/recentModels";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import ModelSelectorTrigger from "./ModelSelectorTrigger";
import ModelSelectorPanel from "./ModelSelectorPanel";

interface ModelSelectorProps {
  onChange?: (modelId: string) => void;
  modelId?: string;
  disabled?: boolean;
  className?: string;
  toolbarMode?: boolean;
}

const ModelSelector: React.FC<ModelSelectorProps> = ({ onChange, modelId, disabled }) => {
  const dispatch = useAppDispatch();
  const pathname = usePathname();
  const { models, providers, selectedModelId } = useAppSelector((state) => state.models);
  const chats = useAppSelector((state) => state.conversation.byId);
  const [isOpen, setIsOpen] = useState(false);
  const [recentModelIds, setRecentModelIds] = useState<string[]>(getRecentModels);

  const activeChatId = pathname.startsWith("/chat/") ? pathname.split("/chat/")[1] : null;
  const activeChat = activeChatId ? chats[activeChatId] : null;
  const hasMessages = activeChat?.messages?.some((msg) => msg.role === "user") || false;

  const isDisabled = disabled || (!!activeChatId && hasMessages);

  const activeChatModelId = activeChat?.model_id;
  const currentModelId = modelId || activeChatModelId || getPreferredModelId(models, selectedModelId);

  const currentModel = useMemo(
    () => models.find((m) => m.id === currentModelId) ?? null,
    [models, currentModelId],
  );

  // 按 provider 分组（只含 enabled 模型）
  const modelsByProvider = useMemo(
    () =>
      [...providers]
        .sort((a, b) => a.order - b.order)
        .map((provider) => ({
          ...provider,
          models: models.filter((m) => m.provider === provider.id && m.enabled !== false),
        }))
        .filter((group) => group.models.length > 0),
    [providers, models],
  );

  // 默认激活当前模型所属的 provider
  const [activeProvider, setActiveProvider] = useState<string>("");
  const effectiveProvider = useMemo(() => {
    if (activeProvider && modelsByProvider.some((g) => g.id === activeProvider)) {
      return activeProvider;
    }
    const currentProvider = currentModel?.provider;
    if (currentProvider && modelsByProvider.some((g) => g.id === currentProvider)) {
      return currentProvider;
    }
    return modelsByProvider[0]?.id || "";
  }, [activeProvider, currentModel, modelsByProvider]);

  const handleModelChange = useCallback(
    (value: string) => {
      dispatch(setSelectedModel(value));

      if (activeChatId && !hasMessages) {
        dispatch(updateConversationModel({ id: activeChatId, model_id: value }));
      }

      // 更新最近使用
      addRecentModel(value);
      setRecentModelIds(getRecentModels());

      // 切换到选中模型的 provider 标签
      const selectedModel = models.find((m) => m.id === value);
      if (selectedModel) {
        setActiveProvider(selectedModel.provider);
      }

      onChange?.(value);
      setIsOpen(false);
    },
    [dispatch, activeChatId, hasMessages, onChange, models],
  );

  const handleProviderChange = useCallback((providerId: string) => {
    setActiveProvider(providerId);
  }, []);

  if (models.length === 0) return null;

  return (
    <Popover open={isOpen} onOpenChange={isDisabled ? undefined : setIsOpen}>
      <PopoverTrigger asChild>
        <ModelSelectorTrigger
          model={currentModel}
          providers={providers}
          isOpen={isOpen}
          disabled={isDisabled}
        />
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="start"
        avoidCollisions={true}
        sideOffset={4}
        className="p-0 w-[calc(100vw-32px)] sm:w-[480px] max-h-[420px] overflow-y-auto"
      >
        <ModelSelectorPanel
          modelsByProvider={modelsByProvider}
          selectedModelId={currentModelId}
          recentModelIds={recentModelIds}
          allModels={models}
          activeProvider={effectiveProvider}
          onSelect={handleModelChange}
          onProviderChange={handleProviderChange}
        />
      </PopoverContent>
    </Popover>
  );
};

export default ModelSelector;
```

- [ ] **Step 2: 提交**

```bash
git add src/components/models/ModelSelector.tsx
git commit -m "feat: ModelSelector 集成 provider 标签页和最近使用功能"
```

---

### Task 5: 构建验证 + 测试适配

**Files:**
- Modify: `src/components/models/ModelSelector.test.tsx`（如果有测试因 props 变化而失败）

- [ ] **Step 1: 构建验证**

```bash
cd /Users/sean/code/fusion/fusion-ui
npm run build
```

Expected: 构建成功，无 TypeScript 错误

- [ ] **Step 2: 运行测试**

```bash
npm test
```

如有测试失败（主要是 ModelSelectorTrigger 新增了 `providers` prop），更新测试文件中对应的 mock 数据。

- [ ] **Step 3: 推送**

```bash
git push origin master
```

- [ ] **Step 4: 验证部署**

等待 CI 通过后在 dev 上打开前端，验证：
- 触发器显示双行（模型名 + provider 名）
- 面板打开后显示最近使用区域
- Provider 标签页可切换，默认选中当前模型的 provider
- 选择模型后面板关闭，触发器更新
- 深色模式下样式正常
