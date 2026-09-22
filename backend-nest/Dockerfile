# ---------------------------------------------------------------------------
# 产品推荐博客站点 —— 后端服务镜像
# 多阶段构建：构建阶段编译 TypeScript，运行阶段只保留产物与生产依赖
# ---------------------------------------------------------------------------
FROM node:22-bookworm-slim AS builder

WORKDIR /app

# 安装 FFmpeg（运行时与构建阶段都需要：种子脚本会真实抽帧）
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

RUN corepack enable

# 先复制依赖清单，利用 Docker 层缓存
COPY package.json pnpm-lock.yaml* ./
COPY prisma ./prisma
COPY scripts ./scripts
COPY tsconfig.json nest-cli.json ./

RUN pnpm install --prod=false

COPY src ./src

RUN pnpm prisma:generate && pnpm build

# ---------------------------------------------------------------------------
FROM node:22-bookworm-slim AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV API_PREFIX=api
ENV STORAGE_DRIVER=local

# FFmpeg / FFprobe：视频抽帧依赖
RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg openssl ca-certificates tini \
  && rm -rf /var/lib/apt/lists/*

RUN corepack enable

COPY package.json pnpm-lock.yaml* ./
COPY prisma ./prisma
COPY scripts ./scripts

RUN pnpm install --prod=false

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma

# 上传目录（建议挂载卷持久化）
RUN mkdir -p storage/uploads/tmp storage/uploads/demo

EXPOSE 3000

# 优雅退出：tini 负责转发信号，Nest 的 enableShutdownHooks 会断开 Prisma / Redis
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "dist/main.js"]
