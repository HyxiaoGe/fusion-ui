# 编码规范

## TypeScript

- 严格类型，避免 `any`
- 类型定义集中在 `src/types/`，组件 props 类型可内联
- 接口用 `interface`，联合类型/工具类型用 `type`

## React 组件

- 函数组件 + hooks，不使用 class 组件
- 组件文件使用 PascalCase（如 `ChatMessage.tsx`）
- 一个文件一个主组件，辅助小组件可同文件

## 样式

- 使用 Tailwind CSS，不写自定义 CSS（除非 Tailwind 无法实现）
- 颜色使用 Tailwind 语义化 token，不硬编码 hex/rgb
- 暗色模式通过 Tailwind `dark:` 前缀处理

## 国际化

- 用户可见文本走 i18next（`src/lib/i18n/`）
- 支持 zh-CN 和 en-US

## 测试

- 测试框架：Vitest + @testing-library/react
- 测试文件放在对应模块目录下（`__tests__/` 或 `.test.ts`）
