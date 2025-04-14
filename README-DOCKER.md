# Docker部署指南

## 前提条件

- 安装Docker: [https://docs.docker.com/get-docker/](https://docs.docker.com/get-docker/)
- 安装Docker Compose: [https://docs.docker.com/compose/install/](https://docs.docker.com/compose/install/)

## 部署步骤

### 方法一：使用Docker Compose（推荐）

1. 在项目根目录下执行：

```bash
docker-compose up -d
```

这将构建镜像并在后台启动容器。

2. 访问应用：

打开浏览器，访问 http://localhost:3000

3. 停止应用：

```bash
docker-compose down
```

### 方法二：使用Docker命令

1. 构建Docker镜像：

```bash
docker build -t fusion-ui .
```

2. 运行Docker容器：

```bash
docker run -p 3000:3000 -d fusion-ui
```

3. 停止容器：

```bash
# 查找容器ID
docker ps

# 停止容器
docker stop <容器ID>
```

## 开发模式下的Docker部署

如果您想在开发环境中使用Docker并支持热重载，请使用：

```bash
docker-compose -f docker-compose.dev.yml up
```

## 故障排除

- 如果遇到权限问题，可能需要使用sudo运行Docker命令
- 如果3000端口被占用，可以修改docker-compose.yml中的端口映射
- 查看容器日志：`docker logs <容器ID>` 