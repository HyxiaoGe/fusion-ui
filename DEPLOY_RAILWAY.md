# Railway 部署指南

本指南将帮助你将 Fusion UI 的 Web 版本部署到 Railway。

## 部署前准备

1. **确保你有以下账号**：
   - GitHub 账号（已有项目仓库）
   - Railway 账号（如果没有，访问 https://railway.app 注册）

2. **检查后端 API**：
   - 确保你的后端 API（默认 `http://192.168.31.98:8000`）可以从外网访问
   - 或者你需要先将后端 API 部署到云服务器

## 部署步骤

### 方法一：通过 GitHub 直接部署（推荐）

1. **登录 Railway**
   - 访问 https://railway.app
   - 使用 GitHub 账号登录

2. **创建新项目**
   - 点击 "New Project"
   - 选择 "Deploy from GitHub repo"
   - 授权 Railway 访问你的 GitHub 仓库
   - 选择 `fusion-ui` 仓库

3. **配置环境变量**
   - 在 Railway 项目设置中，点击 "Variables"
   - 添加以下环境变量：
     ```
     NEXT_PUBLIC_API_BASE_URL=https://your-backend-name.up.railway.app
     ```
   - **注意**: 如果你的后端也部署在 Railway 上，URL 格式为 `https://项目名.up.railway.app`，不需要端口号

4. **部署**
   - Railway 会自动检测到 Next.js 项目
   - 自动执行构建和部署
   - 等待部署完成（通常需要 3-5 分钟）

5. **获取访问地址**
   - 部署成功后，Railway 会提供一个域名
   - 格式类似：`your-app-name.up.railway.app`

### 方法二：使用 Railway CLI

1. **安装 Railway CLI**
   ```bash
   npm install -g @railway/cli
   ```

2. **登录 Railway**
   ```bash
   railway login
   ```

3. **在项目目录初始化**
   ```bash
   cd fusion-ui
   railway init
   ```

4. **设置环境变量**
   ```bash
   railway variables set NEXT_PUBLIC_API_BASE_URL=https://your-backend-name.up.railway.app
   ```

5. **部署**
   ```bash
   railway up
   ```

## Railway 服务间通信

如果你的前端和后端都部署在 Railway 上，有两种连接方式：

### 方式一：公网 URL（推荐）
使用后端的公网 Railway URL：
```
NEXT_PUBLIC_API_BASE_URL=https://your-backend-name.up.railway.app
```

### 方式二：内网通信（高级）
如果前后端在同一个 Railway 项目组中，可以使用内网域名：
```
NEXT_PUBLIC_API_BASE_URL=http://backend:8000
```
其中 `backend` 是你后端服务的名称。

**推荐使用方式一**，因为：
- 更简单直接
- 减少配置复杂度
- Railway 的网络性能很好，延迟可忽略

## 部署后配置

1. **自定义域名**（可选）
   - 在 Railway 项目设置中，点击 "Settings"
   - 在 "Domains" 部分添加自定义域名
   - 按照指引配置 DNS

2. **监控和日志**
   - Railway 提供实时日志查看
   - 在项目面板中点击 "Logs" 查看应用日志

## 常见问题

### 1. 构建失败
- 检查 `package.json` 中的依赖是否完整
- 确保 `npm run build` 在本地可以成功执行

### 2. 环境变量未生效
- 确保环境变量名称正确（注意 `NEXT_PUBLIC_` 前缀）
- 重新部署应用使环境变量生效

### 3. API 连接失败
- 确保后端 API 支持 CORS
- 检查 API 地址是否正确且可以从外网访问
- 如果后端也在 Railway 上，确保后端项目正常运行且 URL 正确

### 4. 端口问题
- Railway 会自动设置 PORT 环境变量
- 应用已配置为使用 Railway 提供的端口

## 注意事项

1. **仅部署 Web 版本**
   - Railway 只能部署 Next.js Web 应用
   - Electron 桌面版需要单独打包分发

2. **数据存储**
   - IndexedDB 数据存储在用户浏览器本地
   - 不同设备/浏览器之间的数据不会同步

3. **性能优化**
   - Railway 提供自动扩缩容
   - 可以在项目设置中调整资源限制

## 更新部署

当你推送新代码到 GitHub 时，Railway 会自动触发重新部署。你也可以在 Railway 面板中手动触发部署。

## 费用说明

Railway 提供免费套餐，包含：
- 500 小时/月的运行时间
- 100GB 出站流量
- 适合个人项目和测试使用

生产环境建议升级到付费套餐以获得更好的性能和稳定性。