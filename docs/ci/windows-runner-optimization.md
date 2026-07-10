# Windows Runner CI 优化

## 目标

Fusion UI 的 Windows Build Job 在优化前平均约 5 分钟。本次改造目标是消除宿主机与 Docker 内重复执行的依赖安装和 Next.js 构建，将稳定热缓存耗时降低到 3.5 分钟以内。

## 构建结构

Dockerfile 提供以下 target：

- `deps`：安装完整依赖。
- `test`：复用依赖层并运行完整 Vitest。
- `builder`：复用依赖层并执行 Next.js 正式构建。
- `production-deps`：安装生产依赖。
- `production`：组装最终运行镜像。

GitHub Actions 的 Windows Job 先构建 `test` target。测试通过后再构建、加载并推送 `production` target。两个阶段共享 `docker-buildx-cache\fusion-ui\shared` 项目级本地缓存。

## 本地验证

在仓库根目录执行：

```powershell
docker buildx build --target test --progress=plain .

docker buildx build `
  --load `
  --target production `
  --provenance=false `
  --build-arg NEXT_PUBLIC_AUTH_SERVICE_BASE_URL=http://example.invalid `
  --build-arg NEXT_PUBLIC_AUTH_SERVICE_CLIENT_ID=ci-test `
  --build-arg NEXT_PUBLIC_AUTH_CALLBACK_URL=http://example.invalid/auth/callback `
  --build-arg API_BACKEND_URL=http://fusion-api:8000 `
  -t fusion-ui:ci-local `
  .
```

启动最终镜像并执行 HTTP Smoke：

```powershell
docker run -d --rm --name fusion-ui-ci-local -p 3300:3000 fusion-ui:ci-local
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:3300/ -TimeoutSec 15
docker stop fusion-ui-ci-local
```

## 2026-07-10 本地基线

- 旧 Dockerfile 全新 builder 的冷构建和加载：约 227 秒。
- 新 `test` target 热依赖层：约 38 秒，106 个测试文件、795 个测试通过。
- 新 `production` target 首次构建和加载：约 90 秒。
- 在源码/工作流变更导致测试和 Next.js 构建层失效、但依赖层命中的情况下，`test` 为 37.5 秒、`production` 为 69.4 秒，合计约 107 秒。
- 新 production 容器 HTTP Smoke：状态码 200。

真实收益以 Pull Request 分支在 `windows-build-01` 上连续两次运行的数据为准。

## 回滚

回滚本次 Dockerfile 和 GitHub Actions 工作流提交即可恢复旧流程。无需修改 Windows Runner 服务、ACR 配置或 Dev 服务器部署拓扑。
