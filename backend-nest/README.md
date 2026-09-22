# 产品推荐博客站点 · 后端服务（backend-nest）

NestJS 11 + Prisma 6 + MySQL 8.4 + Redis 6/7 实现的后端服务，为「产品推荐博客站点」提供
前台门户接口、RBAC 后台管理接口、博客文章管理、FFmpeg 视频抽帧与分片上传能力。

- 统一响应结构、分页契约、权限码、领域模型全部来自工作区共享包 `@sanmuzi/contracts`（本目录只读引用，不修改）。
- 全中文注释与中文 Swagger 描述；业务逻辑集中在 Service，Controller 只做参数与路由编排。

---

## 一、环境要求

| 依赖 | 版本 | 说明 |
| --- | --- | --- |
| Node.js | >= 20.11（实测 v22.23.2） | 需支持 `fetch` |
| pnpm | >= 9（实测 12.5.1） | 工作区根目录 `G:\dulizhan` 执行安装 |
| MySQL | 8.4 | 连接串见 `.env` 的 `DATABASE_URL` |
| Redis | 6+ | 连接串见 `.env` 的 `REDIS_URL`；**不可用时服务仍可启动**（自动降级） |
| FFmpeg / FFprobe | 任意近期版本 | 需要在 PATH 中，或通过 `.env` 的 `FFMPEG_PATH` / `FFPROBE_PATH` 指定 |

---

## 二、快速启动（Windows / PowerShell）

```powershell
# 1. 安装依赖（工作区根目录）
cd G:\dulizhan
pnpm install --filter @sanmuzi/backend

# 2. 生成 Prisma Client
pnpm --filter @sanmuzi/backend prisma:generate

# 3. 建表（迁移文件位于 prisma/migrations/）
pnpm --filter @sanmuzi/backend prisma:deploy

# 4. 写入种子数据（2 个角色、2 个账号、6 篇演示文章、30 条登录日志）
pnpm --filter @sanmuzi/backend seed

# 5. 构建 & 启动
pnpm --filter @sanmuzi/backend build
cd G:\dulizhan\backend-nest
node dist/main.js
```

一键完成 2~4 步：`pnpm --filter @sanmuzi/backend bootstrap`

启动后：

| 地址 | 说明 |
| --- | --- |
| `http://localhost:3000/api` | 接口根路径（全局前缀 `api`） |
| `http://localhost:3000/api/docs` | Swagger 接口文档（含 Bearer 鉴权） |
| `http://localhost:3000/static/uploads/...` | 上传文件静态访问（**不套 api 前缀**） |

### 演示账号

| 用户名 | 密码 | 角色 | 权限范围 |
| --- | --- | --- | --- |
| `admin` | `Admin@123456` | 超级管理员 | 全部 15 项权限 |
| `editor` | `Editor@123456` | 内容编辑 | 仅文章增删改查与资源上传 5 项 |

### 迁移说明（重要）

本机 MySQL 账号没有创建 shadow database 的权限，`prisma migrate dev` 会以 `P3014` 失败，
因此采用如下等价流程：

1. `prisma db push`（或 `migrate deploy`）把 schema 同步到数据库；
2. `prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script`
   离线生成 `prisma/migrations/20260101000000_init/migration.sql`；
3. `prisma migrate resolve --applied 20260101000000_init` 标记为已应用。

之后统一使用 `pnpm prisma:deploy` 即可（无待应用迁移）。

---

## 三、目录说明

```
backend-nest/
├─ prisma/
│  ├─ schema.prisma                 # 数据模型（已定稿，不在本次实现中修改）
│  ├─ migrations/                   # 迁移文件（init）
│  └─ seed.ts                       # 幂等种子脚本（tsx 执行）
├─ scripts/run-with-env.ts          # Prisma CLI 包装器：显式加载 backend-nest/.env
├─ src/
│  ├─ main.ts                       # 启动装配：前缀/管道/拦截器/过滤器/CORS/Swagger/静态资源
│  ├─ app.module.ts                 # 根模块（含全局守卫 APP_GUARD）
│  ├─ config/configuration.ts       # 环境变量读取（dotenv 指定 .env 绝对路径）
│  ├─ prisma/                       # PrismaService（全局模块）
│  ├─ redis/                        # RedisService（全局模块，失败自动降级）
│  ├─ common/
│  │  ├─ constants/                 # 权限码再导出、存储与缓存常量
│  │  ├─ decorators/                # @Public @RequirePermissions @CurrentUser @RawResponse
│  │  ├─ guards/                    # JwtAuthGuard、PermissionsGuard（均为全局守卫）
│  │  ├─ interceptors/              # TransformInterceptor（统一成功包装）
│  │  ├─ filters/                   # AllExceptionsFilter（统一错误包装 + traceId）
│  │  ├─ exceptions/                # BizException（承载 contracts 的 BizCode）
│  │  └─ utils/                     # ip / json / file / ffmpeg / 分页 / 管理员信息
│  └─ modules/
│     ├─ auth/                      # 登录、profile、改密、JWT 策略
│     ├─ admin-user/                # 账号管理（含「最后一个超管」保护）
│     ├─ admin-role/                # 角色管理（内置角色保护、权限码白名单）
│     ├─ login-log/                 # 登录日志（join 用户名/姓名）
│     ├─ blog/                      # 文章 CRUD、上下架、推荐、排序
│     ├─ portal/                    # 前台公开接口（站点配置、文章列表/详情 + Redis 缓存）
│     ├─ dashboard/                 # 工作台统计（7 天登录趋势）
│     └─ file-storage/              # 存储抽象（local/minio）、视频抽帧、分片上传
├─ storage/uploads/                 # 本地上传目录（静态资源根，挂载卷持久化）
├─ Dockerfile                       # 多阶段构建（内含 ffmpeg）
└─ docker/docker-compose.yml        # 后端 + MySQL 8.4 + Redis 一键编排
```

---

## 四、接口分组

### 1. 前台门户（`@Public`，无需登录）

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/portal/site-config` | 站点配置（站点名/副标题/描述/导航/页脚/备案号） |
| GET | `/api/portal/articles?page&pageSize` | 推荐且已上架文章分页，`sort desc, id desc`，**不含 content**，结果按 `PORTAL_CACHE_TTL` 缓存 |
| GET | `/api/portal/articles/:id` | 文章详情（含富文本 content），未上架或未推荐返回 40400 |

### 2. 鉴权

| 方法 | 路径 | 权限 |
| --- | --- | --- |
| POST | `/api/auth/login` | 公开。失败也写 `admin_login_log`；Redis 失败限流（`LOGIN_FAIL_WINDOW` / `LOGIN_FAIL_MAX` / `LOGIN_LOCK_SECONDS`），超限 42900 |
| GET | `/api/auth/profile` | 登录即可，返回含实时权限的 `AdminUserInfo` |
| POST | `/api/auth/change-password` | 登录即可，校验旧密码后 bcrypt 重写 |

### 3. 账号管理 `/api/admin/users`

| 方法 | 路径 | 权限码 |
| --- | --- | --- |
| GET | `/api/admin/users` | `system:user:list` |
| POST | `/api/admin/users` | `system:user:create` |
| PUT | `/api/admin/users/:id` | `system:user:update` |
| DELETE | `/api/admin/users/:id` | `system:user:delete` |
| POST | `/api/admin/users/:id/reset-password` | `system:user:reset-password` |

### 4. 角色管理 `/api/admin/roles`（返回 `userCount`）

| 方法 | 路径 | 权限码 |
| --- | --- | --- |
| GET | `/api/admin/roles` / `/api/admin/roles/options` | `system:role:list` |
| POST | `/api/admin/roles` | `system:role:create` |
| PUT | `/api/admin/roles/:id` | `system:role:update` |
| DELETE | `/api/admin/roles/:id` | `system:role:delete`（内置角色或被占用 → 40900） |

### 5. 登录日志

| 方法 | 路径 | 权限码 |
| --- | --- | --- |
| GET | `/api/admin/login-logs` | `system:log:list`（时间区间 + username + loginResult 筛选，join username/realName） |

### 6. 博客文章 `/api/admin/articles`

| 方法 | 路径 | 权限码 |
| --- | --- | --- |
| GET | `/api/admin/articles` | `blog:article:list`（列表不含 content） |
| GET | `/api/admin/articles/:id` | `blog:article:list`（含 content，编辑页回填） |
| POST | `/api/admin/articles` | `blog:article:create` |
| PUT | `/api/admin/articles/:id` | `blog:article:update` |
| DELETE | `/api/admin/articles/:id` | `blog:article:delete` |
| PATCH | `/api/admin/articles/:id/publish` | `blog:article:update`，body `{ value: boolean }` |
| PATCH | `/api/admin/articles/:id/recommend` | `blog:article:update`，body `{ value: boolean }` |
| PATCH | `/api/admin/articles/:id/sort` | `blog:article:update`，body `{ sort: number }` |

> 文章任何写操作（增删改 / 上下架 / 推荐 / 排序）都会清理前台文章列表缓存。

### 7. 文件与视频 `/api/admin/files`（权限码统一 `blog:article:upload`）

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/api/admin/files/image` | multipart，字段名 `file`，返回 `UploadedFileVo` |
| POST | `/api/admin/files/video` | 小视频直传，返回 `UploadedVideoVo`（含 ffprobe 时长 + 随机抽帧封面） |
| POST | `/api/admin/files/video/chunk/init` | body `ChunkInitDto` → `ChunkInitVo`（已上传分片用于断点续传；`fileHash` 已合并则 `instant: true`） |
| POST | `/api/admin/files/video/chunk/part` | multipart：`uploadId`、`chunkIndex`、`file` |
| POST | `/api/admin/files/video/chunk/merge` | body `{ uploadId }` → 按序合并 → ffprobe → 抽帧 → `UploadedVideoVo` |
| POST | `/api/admin/files/video/frame` | body `ExtractFrameDto` → `ExtractFrameVo`（指定时间点或随机） |

### 8. 工作台

| 方法 | 路径 | 权限码 |
| --- | --- | --- |
| GET | `/api/admin/dashboard/stats` | `blog:article:list`（含最近 7 天登录趋势，缺失日期补 0） |

---

## 五、核心实现要点

### 统一响应

- 成功：`{ code: 0, message: 'ok', data, timestamp }`
- 失败：`{ code, message, data: null, timestamp, traceId }`（响应头同时返回 `X-Trace-Id`）
- 错误码 → HTTP：40000→400、40100→401、40300→403、40400→404、40900→409、42900→429、50000→500

### 鉴权与 RBAC

- JWT payload 只有 `{ userId, roleId }`；`JwtStrategy` 使用 `ExtractJwt` + `secretOrKey: Buffer.from(secret)` + `ignoreExpiration: false`，
  校验时查库确认账号存在且 `status === 1`，禁用账号直接 40100。
- `PermissionsGuard` **每次请求实时查库**读取 `AdminRole.permissions` 并 `JSON.parse`，命中任一权限码才放行；
  超级管理员（roleId=1）走同一条查库链路，权限变更立即生效。
- 守卫注册顺序：`JwtAuthGuard` → `PermissionsGuard`（均为 `APP_GUARD`）。

### Redis 降级

`RedisService` 使用 `lazyConnect` + 有限重试，连接失败时只打印告警并把 `available` 置为 false：

- 缓存读返回 null、写忽略；
- 登录限流跳过（仅记录日志）；
- 分片上传会话回退到磁盘 `storage/uploads/chunk-temp/<uploadId>/meta.json` 与目录扫描，断点续传依旧可用。

### 存储抽象

`StorageService`（抽象）+ `LocalStorageProvider` / `MinioStorageProvider`，由 `STORAGE_DRIVER` 选择，对外只暴露
`uploadBuffer` / `uploadFile` / `delete` / `resolveUrl`：

- local：写入 `storage/uploads/<category>/<yyyy>/<MM>/<随机名>.<ext>`，返回 `/static/uploads/...` 站内相对地址；
- minio：使用 `minio` 包写入 bucket，服务端不可用时抛明确错误（不静默失败）。

### 视频处理

- 探测：`ffprobe -v error -print_format json -show_format -show_streams <file>`，解析 `format.duration` 与视频流宽高，失败返回 null；
- 抽帧：`ffmpeg -y -ss <time> -i <file> -frames:v 1 -q:v 2 -vf "scale='min(1280,iw)':-2" <out.jpg>`；
- 随机时间点：`random(0, max(duration - 1, 0))`，保留 2 位小数；
- Windows 兼容：`spawnSync` + `windowsHide: true` + `maxBuffer: 32MB`，自动用 `where` 解析 `ffmpeg.exe` / `ffprobe.exe`，stderr 收进错误信息；
- 产物入库为站内相对地址，**不把 `PUBLIC_BASE_URL` 写死进数据库**。

---

## 六、Docker 部署

```powershell
cd G:\dulizhan\backend-nest
docker compose -f docker/docker-compose.yml up -d --build

# 首次建表 + 种子数据
docker compose -f docker/docker-compose.yml exec backend pnpm prisma:deploy
docker compose -f docker/docker-compose.yml exec backend pnpm seed
```

容器编排包含 `backend`（内置 ffmpeg）、`mysql:8.4`（宿主 3307）、`redis:7-alpine`（宿主 6380）与上传卷 `uploads-data`。

---

## 七、常用脚本

| 命令 | 说明 |
| --- | --- |
| `pnpm --filter @sanmuzi/backend dev` | 开发模式（watch） |
| `pnpm --filter @sanmuzi/backend build` | 构建（`nest build`，输出 `dist/`） |
| `pnpm --filter @sanmuzi/backend typecheck` | 类型检查（strict，0 错误） |
| `pnpm --filter @sanmuzi/backend prisma:generate` | 生成 Prisma Client |
| `pnpm --filter @sanmuzi/backend prisma:deploy` | 应用迁移 |
| `pnpm --filter @sanmuzi/backend prisma:push` | 无迁移直推 schema（无 shadow DB 权限时使用） |
| `pnpm --filter @sanmuzi/backend seed` | 写入种子数据 |
| `pnpm --filter @sanmuzi/backend bootstrap` | generate + deploy + seed |

---

## 八、主要环境变量（`.env`）

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `PORT` / `API_PREFIX` | `3000` / `api` | 监听端口与全局前缀 |
| `CORS_ORIGINS` | `http://localhost:5173,...` | 逗号分隔白名单，无 Origin 请求放行 |
| `DATABASE_URL` / `REDIS_URL` | — | MySQL / Redis 连接串 |
| `REDIS_KEY_PREFIX` | `sanmuzi:` | Redis key 前缀 |
| `PORTAL_CACHE_TTL` | `30` | 首页列表缓存秒数，`0` 关闭 |
| `LOGIN_FAIL_WINDOW` / `LOGIN_FAIL_MAX` / `LOGIN_LOCK_SECONDS` | `900` / `5` / `900` | 登录失败限流 |
| `JWT_SECRET` / `JWT_EXPIRES_IN` | — / `2h` | 令牌密钥与有效期 |
| `STORAGE_DRIVER` | `local` | `local` 或 `minio` |
| `PUBLIC_BASE_URL` | `http://localhost:3000` | 拼接绝对地址用（不入库） |
| `FFMPEG_PATH` / `FFPROBE_PATH` | 空 | 留空则从 PATH 查找 |
| `MAX_IMAGE_SIZE_MB` / `MAX_VIDEO_SIZE_MB` / `MAX_CHUNK_SIZE_MB` | `10` / `500` / `8` | 上传大小上限 |
| `SEED_DOWNLOAD_VIDEO` | `true` | 种子脚本是否下载示例视频并真实抽帧 |
