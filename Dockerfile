# syntax=docker/dockerfile:1.7

FROM node:20-alpine AS deps

WORKDIR /app

ENV ELECTRON_SKIP_BINARY_DOWNLOAD=1 \
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 \
    NPM_CONFIG_AUDIT=false \
    NPM_CONFIG_FUND=false

COPY package.json package-lock.json ./

RUN --mount=type=cache,target=/root/.npm \
    npm ci --ignore-scripts --no-audit --no-fund


FROM deps AS source

COPY . .


FROM source AS test

ENV NODE_ENV=test

RUN npm test


FROM source AS builder

# NEXT_PUBLIC_* 会在构建时写入浏览器 bundle。
ARG NEXT_PUBLIC_AUTH_SERVICE_BASE_URL
ARG NEXT_PUBLIC_AUTH_SERVICE_CLIENT_ID
ARG NEXT_PUBLIC_AUTH_CALLBACK_URL

# Next.js rewrites() 在构建时读取 API_BACKEND_URL。
ARG API_BACKEND_URL=http://fusion-api:8000

ENV NEXT_PUBLIC_AUTH_SERVICE_BASE_URL=${NEXT_PUBLIC_AUTH_SERVICE_BASE_URL} \
    NEXT_PUBLIC_AUTH_SERVICE_CLIENT_ID=${NEXT_PUBLIC_AUTH_SERVICE_CLIENT_ID} \
    NEXT_PUBLIC_AUTH_CALLBACK_URL=${NEXT_PUBLIC_AUTH_CALLBACK_URL} \
    API_BACKEND_URL=${API_BACKEND_URL}

RUN npm run build


FROM node:20-alpine AS production-deps

WORKDIR /app

ENV NODE_ENV=production \
    ELECTRON_SKIP_BINARY_DOWNLOAD=1 \
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 \
    NPM_CONFIG_AUDIT=false \
    NPM_CONFIG_FUND=false

COPY package.json package-lock.json ./

RUN --mount=type=cache,target=/root/.npm \
    npm ci --ignore-scripts --omit=dev --no-audit --no-fund


FROM node:20-alpine AS production

WORKDIR /app

ENV NODE_ENV=production

COPY --from=production-deps /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/next.config.js ./next.config.js
COPY --from=builder /app/src ./src

EXPOSE 3000

CMD ["npm", "run", "start"]
