# 构建阶段
FROM node:20-alpine AS builder

WORKDIR /app

# 从环境文件获取环境变量，如果文件存在则使用，否则使用默认值
ARG NEXT_PUBLIC_API_BASE_URL
ENV NEXT_PUBLIC_API_BASE_URL=${NEXT_PUBLIC_API_BASE_URL}

# 复制依赖文件
COPY package*.json ./

# 安装依赖，但带上--ignore-scripts参数避免electron安装问题
RUN npm ci --ignore-scripts

# 复制所有文件
COPY . .

# 构建应用
RUN npm run build

# 生产阶段
FROM node:20-alpine AS production

WORKDIR /app

# 复制package.json和package-lock.json
COPY package*.json ./

# 仅安装生产依赖，排除electron等开发工具
ENV NODE_ENV=production
RUN npm ci --ignore-scripts --omit=dev

# 从构建阶段复制.next文件夹和静态资源
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/next.config.js ./
# 确保复制src目录（对于Next.js 12+使用src目录结构）
COPY --from=builder /app/src ./src

# 暴露端口
EXPOSE 3000

# 启动应用
CMD ["npm", "run", "start"] 