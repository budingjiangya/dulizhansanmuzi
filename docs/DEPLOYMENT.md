# 部署说明

## 一、环境依赖

| 依赖 | 版本要求 | 说明 |
| --- | --- | --- |
| Node.js | >= 20.11 | 后端与两个前端构建运行环境 |
| pnpm | >= 9 | 工作区依赖管理 |
| MySQL | 8.x | 业务数据库，需支持 `utf8mb4` |
| Redis | 6.x+ | 登录限流、首页列表缓存、分片上传会话 |
| FFmpeg / FFprobe | 5.x+ | 视频时长探测与随机抽帧；Docker 镜像中已内置 |
| Nginx | 1.24+ | 托管两个前端静态产物 + 反向代理后端接口与静态资源 |

## 二、后端部署

### 2.1 直接以 Node 进程运行

```bash
pnpm install
pnpm backend:prisma:generate
pnpm backend:prisma:deploy     # 生产环境使用 deploy，不生成新迁移
pnpm backend:build
node backend-nest/dist/main.js
```

### 2.2 Docker

```bash
cd backend-nest/docker
docker compose up -d --build
```

Dockerfile 基于 Node 20 slim 镜像并安装 `ffmpeg`，环境变量通过 compose 的 `environment` 或外部 `.env` 注入。

### 2.3 关键环境变量

| 变量 | 必填 | 说明 |
| --- | --- | --- |
| `DATABASE_URL` | 是 | MySQL 连接串 |
| `REDIS_URL` | 是 | Redis 连接串 |
| `JWT_SECRET` | 是 | **生产必须替换为随机长字符串** |
| `JWT_EXPIRES_IN` | 否 | 默认 `2h` |
| `PORT` / `API_PREFIX` | 否 | 默认 `3000` / `api` |
| `CORS_ORIGINS` | 是 | 前台与后台域名，逗号分隔 |
| `STORAGE_DRIVER` | 否 | `local`（默认）或 `minio` |
| `PUBLIC_BASE_URL` | 否 | 后端对外可访问地址 |
| `MINIO_*` | 选填 | `STORAGE_DRIVER=minio` 时必填 |
| `FFMPEG_PATH` / `FFPROBE_PATH` | 否 | 留空则从 PATH 查找 |
| `PORTAL_CACHE_TTL` | 否 | 首页列表缓存秒数，默认 30，设 0 关闭 |

### 2.4 对象存储切换
默认 `STORAGE_DRIVER=local`，上传文件落在 `backend-nest/storage/uploads/`，通过 `/static/uploads` 对外提供。切换到自建 MinIO：

```env
STORAGE_DRIVER=minio
MINIO_ENDPOINT=minio.example.com
MINIO_PORT=9000
MINIO_USE_SSL=true
MINIO_ACCESS_KEY=...
MINIO_SECRET_KEY=...
MINIO_BUCKET=sanmuzi
```

存储适配层（`src/modules/file-storage/storage.service.ts`）对业务代码透明，无需改动上传与抽帧逻辑。

### 2.5 运维脚本

| 命令 | 用途 |
| --- | --- |
| `pnpm --filter @sanmuzi/backend cache:flush` | 清空本站 Redis 缓存键（首页列表、站点配置），改配置或演示数据后让前台立即生效 |
| `pnpm --filter @sanmuzi/backend cache:flush -- --dry-run` | 只列出将被删除的键，不执行删除 |
| `pnpm backend:seed` | 重置并灌入演示数据（**仅演示环境**，会清空业务表） |

站点配置与首页列表都带缓存：站点配置 24 小时，首页列表由 `PORTAL_CACHE_TTL`（默认 30 秒）控制。文章的任何写操作都会自动清除首页列表缓存，只有站点配置需要手工刷新。

### 2.6 Windows 环境提示

- `nest build` 依赖 TypeScript 全量编译（已关闭 `incremental`）。关闭原因是 `nest-cli.json` 的 `deleteOutDir` 会先删 `dist/`，而增量缓存会因「无变更」跳过 emit，导致 `dist/` 为空却构建成功。若改回增量构建，请把 `tsBuildInfoFile` 放到 `dist/` 之外。
- `scripts/smoke.ps1` 是 UTF-8 **带 BOM** 的脚本：Windows PowerShell 5.1 会按系统 ANSI 代码页读取无 BOM 的 UTF-8 文件，导致中文与引号解析出错。编辑该文件时请保持 BOM。

## 三、前端部署

前端是**单应用双区域**，一次构建产出全部页面：

```bash
pnpm portal:build   # 产物 web-portal/dist（含访客端 / 与后台 /admin）
```

| 页面区域 | 访问路径 |
| --- | --- |
| 访客端首页 / 文章详情 | `/`、`/article/:id` |
| 管理后台 | `/admin`（登录页 `/admin/login`） |

后台依赖（Naive-UI、WangEditor）已做按需懒加载，访客端首屏只加载约 170 kB 的入口 chunk。

生产构建前按环境设置 `VITE_API_BASE` / `VITE_ASSET_BASE`（留空表示同源，由 Nginx 反向代理）。

### Nginx 参考配置

```nginx
server {
  listen 80;
  server_name www.example.com;

  root /var/www/web-portal;
  index index.html;

  # 访客端与后台共用一套静态产物与 history 回退
  location / {
    try_files $uri $uri/ /index.html;
  }

  location /api/ {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    client_max_body_size 600m;          # 与 MAX_VIDEO_SIZE_MB 匹配
  }

  location /static/ {
    proxy_pass http://127.0.0.1:3000;
  }
}
```

要点：

1. `/admin` 与访客端同源同产物，**不需要单独部署第二个站点**；`try_files` 回退同时覆盖 `/admin/**` 深链与刷新。
2. `X-Forwarded-For` 必须透传，否则登录日志记录的是 Nginx 的 IP。
3. `client_max_body_size` 要大于分片大小（默认 8MB）与视频直传上限，否则大文件请求会被 Nginx 提前拒绝。
4. 如果确实要把后台暴露到独立域名（例如 `admin.example.com`），让该域名同样指向 `web-portal/dist` 即可，无需另建构建；也可在 Nginx 上只放行该域名的 `/admin` 与 `/api` 前缀以收敛暴露面。
5. 建议为后台路径加 `robots.txt` 拒绝收录。

## 四、验证脚本（部署后自检）

| 命令 | 作用 |
| --- | --- |
| `pnpm smoke` | 后端接口端到端冒烟，28 项断言（公开接口、鉴权、RBAC 越权、抽帧、分片上传） |
| `pnpm verify:admin-ui` | 无头 Chrome 真实渲染后台，29 项断言（布局不错位、主题生效、接口数据、硬刷新后登录态恢复）+ 截图 |
| `pnpm verify:admin-ui -- --url=http://localhost:5173 --adminPath=/admin` | 指定地址验证 |

`pnpm verify:admin-ui` 依赖本机已安装的 Chrome/Edge（脚本自动探测），并在 `scripts/artifacts/` 输出各页面截图，便于人工复核。

## 五、上线前检查清单

- [ ] 轮换 `backend-nest/.env` 中的数据库与 Redis 口令，并改为部署平台注入，不要提交仓库。
- [ ] 替换 `JWT_SECRET` 为随机长字符串。
- [ ] `NODE_ENV=production`，`CORS_ORIGINS` 收敛为实际域名。
- [ ] 确认服务器已安装 FFmpeg，或使用内置 FFmpeg 的 Docker 镜像。
- [ ] 执行 `pnpm backend:prisma:deploy` 应用迁移（不要用 `db push`）。
- [ ] seed 脚本只用于演示环境；生产环境请手工创建首个超管账号或改写 seed 参数。
- [ ] 核对备份策略：MySQL 定期全量 + binlog；`storage/uploads` 目录或 MinIO bucket 一并备份。
