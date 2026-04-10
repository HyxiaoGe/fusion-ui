# 架构约束

> 本文件定义"不能做什么"。当前靠文档约束，后续视需要加自动检查。

## 数据流方向

```
页面 (src/app/) → Hooks (src/hooks/) → API 客户端 (src/lib/api/) → 后端
                      ↕
                Redux (src/redux/)
                      ↕
              Dexie 缓存 (src/lib/db/)
```

## 禁止项

| 规则 | 说明 |
|------|------|
| 组件禁止直接 fetch | `src/components/` 中不直接调用 fetch/axios，必须走 `src/lib/api/` |
| 页面禁止厚业务逻辑 | `src/app/` 页面组件只做布局编排，业务逻辑放 hooks 或 components |
| Redux slice 禁止交叉 import | slice 之间不互相 import，需要跨 slice 逻辑走 middleware 或 thunk |
| 禁止绕过 fetchWithAuth | 所有后端请求必须走 `fetchWithAuth`，确保 JWT 自动注入和 refresh |

## 组件目录规则

- 新组件按功能放入 `src/components/` 对应子目录
- 不允许创建 `src/components/common/`、`src/components/shared/` 等泛化目录
- 可复用基础 UI 组件放 `src/components/ui/`
- 新 hooks 放 `src/hooks/`，不在组件目录内创建 hooks 文件

## 状态管理规则

- 全局状态走 Redux，组件局部状态用 useState
- 不在组件中直接操作 Dexie，走 Redux middleware 同步
- 新增全局状态需要新建或扩展 slice，不在组件中用 Context 替代
