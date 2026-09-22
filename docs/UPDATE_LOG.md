# 更新记录

本项目按版本记录每次交付的范围、变更点与验证结论。所有「验证」条目均为实际执行结果，未验证的内容会明确标注。

---

## v1.0.0 · 首期交付：前台门户 + RBAC 后台 + NestJS 服务端

交付日期：2026-05-20
分支：`main`
仓库：`git@github.com:budingjiangya/dulizhansanmuzi.git`

### 一、本次交付范围

按《产品推荐博客网站｜完整技术方案说明书》实现三段式单体仓库，落地前台内容门户、后台管理系统与 NestJS 服务端，并完成数据库迁移、演示数据与端到端验证。

### 二、工程结构

新增工作区骨架，三端共享一份接口契约，避免接口定义在前后端之间漂移。

| 目录 | 说明 |
| --- | --- |
| `contracts/` | 共享契约：统一响应包装与业务码、角色/权限码/封面类型枚举、全部出入参类型 |
| `backend-nest/` | NestJS 11 服务端：鉴权、RBAC、账号、角色、登录日志、文章、文件存储、视频抽帧 |
| `web-portal/` | 前台门户：Vue 3.5 + Vite 6 + TailwindCSS v4 |
| `web-admin/` | 管理后台：Vue 3.5 + Vite 6 + Naive-UI 2.40 |
| `docs/` | 接口文档、部署说明、更新记录 |
| `scripts/` | 端到端冒烟测试脚本 |

根目录新增：`package.json`（工作区脚本）、`pnpm-workspace.yaml`、`.gitignore`、`README.md`。

### 三、契约层（`contracts/`）

- `core.ts`：`ApiResponse<T>` 统一响应体、`PageQuery` / `PageResult<T>` 分页契约、`BizCode` 业务码表（0 成功 / 40000 参数 / 40100 未登录 / 40300 无权限 / 40400 不存在 / 40900 冲突 / 42900 限流 / 50000 服务端）。
- `enums.ts`：`RoleId`、`PERMISSIONS` 全量权限码、`PERMISSION_GROUPS` 权限分组元数据、`ALL_PERMISSIONS`、`CONTENT_EDITOR_PERMISSIONS`、`CoverType`、`AdminStatus`、`LoginResult`、`UploadStatus` 及其中文文案映射。
- `domain.ts`：鉴权、账号、角色、登录日志、文章、文件上传、站点配置、工作台统计的全部出入参类型。

**设计取舍**：JWT 载荷只放 `userId` 与 `roleId`，权限数组不入 Token；后端每次请求实时查库读取角色权限，权限回收后旧 Token 立即失效。

### 四、服务端（`backend-nest/`）

- 沙箱/工程配置：`prisma/schema.prisma`（`admin_user`、`admin_role`、`admin_login_log`、`blog_article` 四张表，含索引与 `onDelete: Cascade`）、`.env` / `.env.example`、`scripts/run-with-env.ts`（让 Prisma CLI 与运行时读取同一份环境变量）。
- 模块：`auth`、`admin-user`、`admin-role`、`login-log`、`blog`、`portal`、`dashboard`、`file-storage`（存储抽象 + 视频服务 + 分片上传会话）、`prisma`、`redis`。
- 公共层：全局 JWT 守卫与 RBAC 权限守卫、统一响应拦截器、全局异常过滤器、`@Public()` / `@RequirePermissions()` / `@CurrentUser()` 装饰器、ffmpeg/ffprobe 工具、IP 与 JSON 工具。
- 视频链路：`ffprobe` 读时长与分辨率 → `0 ~ (时长-1)` 秒随机取点 → `ffmpeg` 抽帧生成静态封面 → 写入 `coverVideoFrame`；支持指定时间点重新抽帧，大视频走 `init → part → merge` 分片上传（会话存 Redis，支持断点续传与秒传）。
- 接口文档：Swagger 挂载 `/api/docs`。

### 五、前台门户（`web-portal/`）

- 页面：首页推荐列表、文章详情、404。
- 核心组件 `BlogCard.vue`：一个组件内实现两套封面 hover 逻辑——多图模式 `mouseenter` 起定时器逐张轮切、`mouseleave` 停止并回到第一张；视频模式默认只渲染后端抽帧静态图，`mouseenter` 才绑定视频源并以 `muted + autoplay` 静音预览，`mouseleave` 立即暂停并卸载 `src` 释放解码资源，**首页不预加载任何视频**。
- 性能：列表图片 `loading="lazy"`，首屏前两张 `fetchpriority="high"`，骨架屏结构与卡片对齐避免布局跳动。
- 设计：排版驱动，去掉 Hero 横幅与堆叠区块，全站只保留留白、字号层级与一条细分隔线；站点配置由接口下发，接口不可用时使用兜底文案保证结构不塌陷。

### 六、管理后台（`web-admin/`）

- 页面：登录、工作台（指标卡 + 近 7 天登录趋势）、文章管理、文章新建/编辑、账号管理、角色权限、登录日志、修改密码、403、404。
- 布局：侧边菜单 + 顶栏（折叠、面包屑、明暗主题、账号下拉）+ 页签栏 + 内容区，窄屏自适应。
- 权限：菜单按权限码过滤，`v-permission` 指令控制按钮显隐，路由守卫对无权页面拦截到 403；接口层由后端守卫二次鉴权。
- 文章编辑：WangEditor 5 富文本（正文图片/视频走统一上传接口）、封面模式切换、多封面图拖拽排序、视频分片上传进度与断点续传、指定时间点重新抽帧、推荐位/上下架/排序权重。

### 七、构建与验证

| 项目 | 结果 |
| --- | --- |
| `pnpm install` | 5 个工作区项目，新增 144 个包，exit 0 |
| 契约层类型检查 | 0 错误 |
| 前台门户构建（`vue-tsc -b && vite build`） | 0 错误，7 个 chunk |
| 管理后台构建（`vue-tsc -b && vite build`） | 0 错误，25 个 chunk |
| 后端构建（`nest build`）与类型检查（strict） | 0 错误，dist 146 个文件，连续三次构建均正常产出 |
| 数据库表结构与种子数据 | 4 张表，2 角色 / 2 账号 / 6 文章 / 30 条登录日志，3 个示例视频真实下载并抽帧 |
| 端到端冒烟（`scripts/smoke.ps1`） | **28/28 全部通过** |
| 两个前端 dev server 与后端联调 | 均通过（含 Vite 代理、history 路由回退、静态资源、RBAC 越权 403） |

详细命令与输出见下方「验证记录」。

### 八、首轮自查发现并修复的缺陷

| # | 缺陷 | 影响 | 处理 |
| --- | --- | --- | --- |
| 1 | `GET /api/admin/roles` 后端返回 `PageResult` 分页包装，而契约声明为 `AdminRoleVo[]` | 后台「角色权限」页会渲染空白（`roles.map` 失败） | 后端改为按契约直接返回数组，删除无效的分页 DTO |
| 2 | `tsconfig.json` 的 `incremental: true` 与 `nest-cli.json` 的 `deleteOutDir: true` 冲突 | `nest build` 第二次执行时静默产出空 `dist/`，`node dist/main.js` 报 `Cannot find module`，构建「成功」但服务起不来 | 关闭 `incremental`，并实测连续三次构建产物完整 |
| 3 | TailwindCSS v4 中 `rounded-[--radius-card]` 被编译为无效的 `border-radius:--radius-card` | 前台卡片与骨架屏圆角在浏览器中被丢弃 | 改用 v4 的变量简写语法 `rounded-(--radius-card)`，构建产物校验无效声明计数为 0 |
| 4 | 演示站点配置的品牌名与前端/文档不一致（后端「三木子严选」vs 前端「三目子」） | 前台标题与页脚文案与项目文档不符 | 统一为「三目子」，并提供 `cache:flush` 脚本清理 24 小时的站点配置缓存 |
| 5 | `scripts/smoke.ps1` 在 Windows PowerShell 5.1 下的四处兼容问题 | 脚本无法运行或误报失败：① 无 BOM 的 UTF-8 被按 ANSI 读取导致解析错误；② 不支持 `-Form`；③ `Invoke-RestMethod` 遇 4xx 抛异常且异常流读不出响应体；④ `New-Object` 无法解析静态属性 `[HttpMethod]::Get` | 加 BOM、手工构造 multipart 请求体、改用 `System.Net.Http.HttpClient`、改用静态方法构造请求，并让脚本自清理测试数据 |

### 九、已知事项

- `backend-nest/.env` 含演示环境的数据库与 Redis 明文口令，为便于直接启动而纳入版本管理；正式上线前必须轮换并改为部署平台注入。
- 角色管理页面允许编辑内置两个角色的权限，但不允许删除；删除仍被账号占用的角色由后端返回 40900。
- 演示素材使用固定种子的在线占位图与公开示例视频；`SEED_DOWNLOAD_VIDEO=true` 时脚本会把示例视频下载到本地静态目录并真实抽帧，下载失败则回退为远程地址，不影响 seed 成功。

---

## 验证记录

> 以下命令均在 `G:\dulizhan` 实际执行，输出为真实结果。

### V1. 依赖安装

```bash
pnpm install
```

结果：`Scope: all 5 workspace projects` → `Packages: +144` → `Done`。

### V2. 前台门户构建

```bash
pnpm --filter @sanmuzi/web-portal build   # vue-tsc -b && vite build
```

结果：`vue-tsc` 类型检查 0 错误；`vite build` 输出 7 个 chunk，`✓ built`。

修复记录：首次构建报 `TS6307`（契约源码不在 tsconfig include 范围内），在两个前端的 `tsconfig.app.json` 中加入 `../contracts/src/**/*.ts` 后通过。

### V3. 管理后台构建

```bash
pnpm --filter @sanmuzi/web-admin build    # vue-tsc -b && vite build
```

结果：`vue-tsc` 类型检查 0 错误；`vite build` 输出 25 个 chunk，`✓ built`。

修复记录（首轮 20 个类型错误，逐项处理）：

| 问题 | 处理方式 |
| --- | --- |
| `RequestOptions` 与 axios 的 `onUploadProgress` 签名冲突 | 改为 `Omit<AxiosRequestConfig, 'onUploadProgress'>` 后自行声明百分比回调 |
| axios 返回类型与解包后的 `T` 不匹配 | 响应拦截器已解包，`request<T>` 内显式断言为 `Promise<T>` |
| `@wangeditor/editor-for-vue` 的 `exports` 未声明 types 条件 | 保留一行等价的环境声明（其自带 d.ts 无法被 Bundler 解析） |
| `NSelect` 不接受 `null` 与 `boolean` 值 | 筛选条件的布尔项改用 `'true'`/`'false'` 字符串承载，请求前转回布尔 |
| `PageQuery.page` 为可选导致 `query.page > 1` 报错 | 分页参数处补默认值 `?? 1` |
| `DialogProviderProps.containerStyle` 不存在 | 移除该项，仅保留主题覆写 |

### V4. 产物缺陷自查（TailwindCSS v4）

检查构建产物 CSS 时发现 `rounded-[--radius-card]` 被编译为无效的 `border-radius:--radius-card`（浏览器会丢弃该声明，圆角实际失效）。改为 v4 的 CSS 变量简写语法 `rounded-(--radius-card)` 后重新构建，产物中已正确输出 `border-radius:var(--radius-card)`，无效声明计数为 0。涉及 `BlogCard.vue`、`ArticleCardSkeleton.vue`、`ArticleDetailView.vue`。

### V5. 数据库与服务端

```bash
pnpm backend:prisma:generate     # Prisma Client v6.19.0
pnpm backend:seed                # 2 角色 / 2 账号 / 6 文章 / 30 条登录日志
pnpm backend:build               # nest build，dist 146 个文件
node backend-nest/dist/main.js
```

实际输出（关键片段）：

```text
[PrismaService] MySQL 连接成功
[RedisService] Redis 连接成功，缓存与登录限流已启用
[Bootstrap] FFmpeg 路径：C:\...\ffmpeg-7.1.1-full_build\bin\ffmpeg.exe
[Bootstrap] 服务已启动：http://localhost:3000/api
[Bootstrap] 接口文档：http://localhost:3000/api/docs
[Bootstrap] 存储驱动：local
```

seed 抽帧结果（真实执行 ffprobe + ffmpeg）：

```text
文章1 视频=sintel-trailer.mp4 时长=52.21s 分辨率=854x480  抽帧时间=0.64s   封面=/static/uploads/demo/sintel-trailer-frame.jpg
文章2 视频=bunny-trailer.mp4  时长=33s    分辨率=853x480  抽帧时间=28.38s  封面=/static/uploads/demo/bunny-trailer-frame.jpg
文章3 视频=movie-300.mp4      时长=300.14s 分辨率=320x240  抽帧时间=256.68s 封面=/static/uploads/demo/movie-300-frame.jpg
```

说明：`prisma migrate dev` 在远程 MySQL 上因账号缺少创建 shadow database 的权限而报 `P3014`，改为 `prisma db push` 建表，再用 `prisma migrate diff --from-empty --to-schema-datamodel` 离线生成迁移文件并 `migrate resolve --applied` 标记；此后 `prisma migrate deploy` 正常（`No pending migrations to apply`）。生产环境仍按 `migrate deploy` 走。

### V6. 端到端冒烟

```bash
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\smoke.ps1
```

```text
[1] 服务可用性与接口文档          2/2
[2] 前台门户公开接口              5/5
[3] 登录鉴权与登录日志            6/6
[4] RBAC 越权拦截（前端绕过验证） 4/4
[5] 后台业务功能                  5/5
[6] 文件上传、FFmpeg 抽帧与分片上传 6/6

全部通过：28/28
```

其中几项关键证据：

| 断言 | 实测结果 |
| --- | --- |
| 首页列表不返回富文本正文 | `list` 单项字段为 id/title/shortDesc/coverType/coverImages/coverVideo/coverVideoFrame/isRecommend/isPublish/sort/createdAt/updatedAt，无 `content` |
| 多图封面为数组 | 《2026 年 4K 显示器怎么选？…》coverImages 3 张 |
| 视频模式带静态抽帧封面 | 《久坐党的人体工学椅选购指南…》coverVideo=/static/uploads/demo/sintel-trailer.mp4 |
| 无 Token 访问管理接口 | `{"code":40100,...}` HTTP 401 |
| 内容编辑越权访问账号/日志/角色接口 | 三处均 `{"code":40300,...}` HTTP 403 |
| 错误密码写入失败日志 | 失败日志条数 22 → 23 |
| 工作台登录趋势 | 7 天完整，缺失补 0 |
| 角色列表 | 返回数组，2 个角色，超管 15 项权限 |
| 抽帧 | 时长 33s，指定第 2 秒抽帧成功，文件落盘可访问 |
| 分片上传（真实视频 2 片） | 合并产物 2,757,913 字节与源一致，ffprobe 读出时长 300.14s，并生成封面帧 |
| 图片上传 | 返回 `/static/uploads/article-image/2026/09/xxx.png`，HEAD 200 |
| 静态资源 | `/static/uploads/demo/bunny-trailer.mp4` HEAD 200 |

前端联调（两个 dev server 指向同一后端）：

```text
前台 http://localhost:5173/                       → 200，SPA 入口正常
前台 /article/7（history 路由）                   → 200，回退 index.html
前台经 Vite 代理 /api/portal/articles             → code=0 total=6
前台经 Vite 代理 /static/uploads/.../frame.jpg    → HEAD 200
后台 http://localhost:5174/                       → 200
后台经代理登录 editor                             → code=0，角色=内容编辑，权限 5 项
后台经代理读文章列表（editor）                    → code=0 total=6
后台经代理读账号管理（editor）                    → HTTP 403（RBAC 生效）
```

### V7. 未覆盖项（诚实声明）

以下内容本次**未做真实验证**，不作为已完成交付：

1. **MinIO 驱动**：`STORAGE_DRIVER=minio` 分支未实测（无可用 MinIO 服务），代码按 `minio` 8.0.7 API 编写，服务端不可用时抛明确错误。
2. **Docker 构建**：`backend-nest/Dockerfile` 与 `docker/docker-compose.yml` 未实际构建运行（本机未确认 Docker 可用）。
3. **修改密码接口的端到端调用**：为避免改动演示账号密码影响演示，仅做了代码路径审查；登录、鉴权、40100/40300 均已实测。
4. **浏览器内交互验证**：多图 hover 轮切、视频 hover 静音预览、拖拽排序、富文本编辑器等交互已通过构建与静态检查，但未在真实浏览器中逐项操作验证。
5. **`prisma migrate dev`**：因远程 MySQL 账号权限限制不可用，改用 `db push` + 离线迁移文件（见 V5）。
