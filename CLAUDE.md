# CLAUDE.md — fusion-ui 导航文件

## 语言

所有回复、注释、提交信息使用中文。Git 格式：`<type>: <中文描述>`，必须包含 Co-Authored-By。

## 快速命令

```bash
npm install                  # 安装依赖
npm run dev:next             # Web 开发服务器（:3000）
npm run dev                  # Web + Electron 开发
npm test                     # 运行 Vitest 测试
npm run build                # 构建 Next.js
npm run analyze              # 分析 bundle 体积
```

## 架构速览

Next.js 15 (App Router) + React 19 + Electron 混合应用，Redux Toolkit 状态管理，Dexie.js 本地缓存。

详见 → [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)

## 工作流程

1. **变更前**：超过 3 个文件的改动，先输出影响分析，等人类确认
2. **编码中**：遵守 [docs/ARCHITECTURE_RULES.md](docs/ARCHITECTURE_RULES.md)
3. **变更后**：运行 `npm run build` 确认构建通过
4. **提交前**：确认改动已 push 且部署通过，不能只改本地就让用户测试

## 详细文档索引

| 文档 | 内容 |
|------|------|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | 技术栈、目录结构、Redux 架构、数据流、Electron 集成 |
| [docs/ARCHITECTURE_RULES.md](docs/ARCHITECTURE_RULES.md) | 架构约束（组件边界、数据流方向、禁止操作） |
| [docs/CODING_CONVENTIONS.md](docs/CODING_CONVENTIONS.md) | 编码风格、命名规范、组件编写约定 |

## 扩展触发条件

以下规则当前不实施，达到阈值时启用：

- **前端组件 >60 个**：引入 entropy 扫描（重复组件、超大组件、未使用 action）
- **页面路由 >10 个**：引入页面级 bundle 分析自动化
