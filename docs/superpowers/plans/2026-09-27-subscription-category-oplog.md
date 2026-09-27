# 邮件订阅 + 分类模块 + 通用操作日志 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 落地邮件订阅（图形验证码 + 后台订阅列表）、文章分类（后台可增删改、可设置文章分类）与通用操作日志（记录后台写操作），三者都带权限码与日志。

**Architecture:** 后端在 `backend-nest` 新增三个模块（`subscription`、`blog-category`、`operation-log`）与一张验证码工具；前端在既有的单应用双区域结构里，后台加三个页面、前台替换两个占位页。接口契约与 Prisma 模型由主理人在冻结阶段一次性写完，成员只实现各自模块内部，避免共享文件冲突。

**Tech Stack:** NestJS 11 + Prisma 6 + MySQL 8.4 + Redis（验证码与限流）+ svg-captcha 1.4.0；前端 Vue 3.5 + Vite 6 + TailwindCSS v4 + Naive-UI 2.40；验证用 `scripts/smoke.ps1` 与 Puppeteer 无头 Chrome 脚本。

**Spec:** `docs/superpowers/specs/2026-09-27-subscription-category-oplog-design.md`

## Global Constraints

- 仓库**无单元测试框架**。验证靠既有的两套设施：`scripts/smoke.ps1`（接口级）、`scripts/verify-*.mjs`（无头 Chrome 渲染级）。不要引入 jest/vitest。
- 统一响应 `{ code, message, data, timestamp }`；分页 `{ list, total, page, pageSize, totalPages }`。
- 错误码：参数 `40000` / 未登录 `40100` / 无权限 `40300` / 不存在 `40400` / 冲突 `40900` / 限流 `42900`。
- 全中文注释与中文 Swagger description；业务写在 service，不写在 controller。
- **成员只跑类型检查，不跑构建**：`pnpm --filter @sanmuzi/backend typecheck`、`pnpm --filter @sanmuzi/web-portal exec vue-tsc --noEmit -p tsconfig.app.json`。`dist/` 与 `web-portal/dist/` 是共享产物，并发构建会互相覆盖；构建与验证由主理人串行执行。
- `scripts/smoke.ps1` **必须保持 UTF-8 带 BOM**（Windows PowerShell 5.1 会按 ANSI 读取无 BOM 文件）。编辑后需确认 BOM 仍在。
- 后端改动后由主理人执行 `pnpm --filter @sanmuzi/backend build` 并重启 `node dist/main.js`；重启前先结束占用 3000 端口的进程。
- 冻结的共享文件（**成员只读，不要修改**）：`contracts/**`、`backend-nest/prisma/schema.prisma`、`backend-nest/src/app.module.ts`、`backend-nest/package.json`、`web-portal/src/router/index.ts`、`web-portal/src/admin/api/**`、`web-portal/src/api/**`、`web-portal/src/admin/config/index.ts`、`web-portal/src/admin/components/icons.ts`。

## 冻结的接口契约（所有成员按此实现，不得改名）

### 后端

```ts
// 验证码工具：backend-nest/src/common/utils/captcha.util.ts
export interface CaptchaChallenge { text: string; svg: string }
export function createCaptcha(): CaptchaChallenge
export function toSvgDataUri(svg: string): string        // 返回 data:image/svg+xml;base64,...

// Redis key（backend-nest/src/common/constants/cache.constants.ts 内已追加）
// CAPTCHA_KEY = 'captcha'                  -> `sanmuzi:captcha:<captchaId>`
// SUBSCRIBE_RATE_KEY = 'subscribe:rate'    -> `sanmuzi:subscribe:rate:<ip>`
```

```ts
// SubscriptionService（模块 A 实现）
getCaptcha(): Promise<CaptchaVo>                                  // { captchaId, imageBase64 }
verifyCaptcha(captchaId: string, code: string): Promise<void>     // 失败抛 BizException.paramInvalid('验证码错误或已过期')
createSubscription(dto: SubscribeDto, ip: string, ua: string): Promise<{ duplicated: boolean }>
listSubscriptions(query: QuerySubscriptionDto): Promise<PageResult<SubscriptionVo>>
removeSubscription(id: number): Promise<null>
```

```ts
// BlogCategoryService（模块 B 实现）
listAll(): Promise<CategoryVo[]>                       // 数组，不分页，含 articleCount
create(dto: CreateCategoryDto): Promise<CategoryVo>
update(id: number, dto: UpdateCategoryDto): Promise<CategoryVo>
remove(id: number): Promise<null>                      // 被占用抛 BizException.conflict(...)
```

```ts
// OperationLogService（模块 B 实现）
record(entry: OperationLogEntry): Promise<void>        // 内部 try/catch，绝不抛错
list(query: QueryOperationLogDto): Promise<PageResult<OperationLogVo>>
```

### 前端 API（主理人在冻结阶段写好，成员只调用）

```ts
// web-portal/src/admin/api/category.ts
fetchCategories(): Promise<CategoryVo[]>
createCategory(data: CreateCategoryDto): Promise<CategoryVo>
updateCategory(id: number, data: UpdateCategoryDto): Promise<CategoryVo>
deleteCategory(id: number): Promise<null>

// web-portal/src/admin/api/subscription.ts
fetchSubscriptions(query: QuerySubscriptionDto): Promise<PageResult<SubscriptionVo>>
deleteSubscription(id: number): Promise<null>

// web-portal/src/admin/api/operationLog.ts
fetchOperationLogs(query: QueryOperationLogDto): Promise<PageResult<OperationLogVo>>

// web-portal/src/api/captcha.ts
fetchCaptcha(): Promise<CaptchaVo>

// web-portal/src/api/subscription.ts
submitSubscription(data: SubscribeDto): Promise<{ duplicated: boolean }>

// web-portal/src/api/category.ts
fetchPortalCategories(): Promise<CategoryVo[]>
fetchPortalCategoryArticles(id: number | string, query?: { page?: number; pageSize?: number }): Promise<PageResult<ArticleListItemVo>>
```

### 路由（主理人已注册，成员只填 page 组件内容）

| 路由 | name | 组件文件 | 负责成员 |
| --- | --- | --- | --- |
| `/category` | `category` | `web-portal/src/views/CategoryListView.vue` | D |
| `/category/:id` | `category-detail` | `web-portal/src/views/CategoryDetailView.vue` | D |
| `/subscribe` | `subscribe` | `web-portal/src/views/SubscribeView.vue` | D |
| `/admin/blog/categories` | `admin-blog-category-list` | `web-portal/src/admin/views/blog/CategoryListView.vue` | C |
| `/admin/system/subscriptions` | `admin-system-subscription-list` | `web-portal/src/admin/views/system/SubscriptionListView.vue` | C |
| `/admin/system/operation-logs` | `admin-system-operation-log` | `web-portal/src/admin/views/system/OperationLogView.vue` | C |

---

## Phase 0 · 冻结接口（主理人执行，成员开始前必须完成）

### Task 0.1: 契约层

**Files:** Modify `contracts/src/enums.ts`、`contracts/src/domain.ts`

- [ ] 在 `PERMISSIONS` 追加 7 个权限码；`PERMISSION_GROUPS` 新增「分类管理」分组，并在「账号管理」后新增「邮件订阅」「操作日志」两组；`CONTENT_EDITOR_PERMISSIONS` 追加 `BLOG_CATEGORY_LIST`。
- [ ] 在 `domain.ts` 追加：`CategoryVo`、`CreateCategoryDto`、`UpdateCategoryDto`、`SubscriptionVo`、`SubscribeDto`、`QuerySubscriptionDto`、`CaptchaVo`、`OperationLogVo`、`QueryOperationLogDto`、`OperationLogEntry`。
- [ ] `ArticleListItemVo` 与 `CreateArticleDto` 增加 `categoryId` / `categoryName`（详情与列表都要回填）。
- [ ] 验证：`pnpm --filter @sanmuzi/contracts typecheck` 0 错误。

### Task 0.2: Prisma 模型与迁移

**Files:** Modify `backend-nest/prisma/schema.prisma`

- [ ] 新增 `BlogCategory`、`BlogSubscription`、`AdminOperationLog` 三个 model（字段见 spec 第三节），`AdminOperationLog.adminUserId` 可空且 `onDelete: SetNull`；`BlogArticle` 增加 `categoryId Int?` 与关系，`onDelete: Restrict`。
- [ ] 执行 `pnpm backend:prisma:push`（远程 MySQL 账号无建 shadow database 权限，沿用既有做法）与 `pnpm --filter @sanmuzi/backend prisma:generate`。
- [ ] 更新 `prisma/seed.ts`：新增 5 个演示分类（如 显示器 / 音频 / 外设 / 桌面 / 家居），并把 6 篇演示文章按主题挂到对应分类。
- [ ] 验证：`pnpm backend:seed` 成功，且 `pnpm backend:cache:flush` 后首页仍有 6 篇以上文章。

### Task 0.3: 装依赖与接线骨架

- [ ] `pnpm --filter @sanmuzi/backend add svg-captcha@1.4.0`。
- [ ] `cache.constants.ts` 追加 `CAPTCHA_KEY`、`SUBSCRIBE_RATE_KEY`。
- [ ] 创建三个模块的**最小可用骨架**（module + controller + service + dto），在 `app.module.ts` 注册，保证 `pnpm --filter @sanmuzi/backend typecheck` 通过。
- [ ] 前端：注册 6 条路由（见上表）、写好 6 个 API 文件、创建 6 个页面占位组件、`icons.ts` 补 3 个菜单图标、`SideMenu.vue` 补三个菜单项（带权限码）。保证 `pnpm portal:build` 通过。
- [ ] 提交：`chore: 冻结第二批接口契约、数据模型与路由骨架`

---

## Phase 1 · 并行实现（4 名成员，写入范围互不重叠）

### Task A: 后端 · 验证码与邮件订阅（成员 A）

**写入范围：** `backend-nest/src/modules/subscription/**`、`backend-nest/src/common/utils/captcha.util.ts`

**Consumes:** 冻结的 `CacheConstants`、`RedisService`、`BizException`、`normalizePaging`/`buildPageResult`、`getClientIp`、`@Public()`、`@RequirePermissions`、`@OperationLog`、`@CurrentUser`

**Produces:** 接口 `GET /api/portal/captcha`、`POST /api/portal/subscriptions`、`GET /api/admin/subscriptions`、`DELETE /api/admin/subscriptions/:id`

- [ ] **Step 1: 实现验证码工具** `captcha.util.ts`
  - `createCaptcha()` 调用 `svgCaptcha.create({ size: 4, noise: 3, color: true, background: '#faf8f5', ignoreChars: '0o1ilI' })`，返回 `{ text: text.toLowerCase(), svg: data }`。
  - `toSvgDataUri(svg)` 返回 `` `data:image/svg+xml;base64,${Buffer.from(svg, 'utf8').toString('base64')}` ``。
  - 注意：`svg-captcha` 用 `require('svg-captcha')` 风格导出，本项目 CommonJS 编译，用 `import * as svgCaptcha from 'svg-captcha'`。

- [ ] **Step 2: `getCaptcha()` 与控制器拆分**
  - 生成 `captchaId = randomUUID()`；答案写 Redis，key 为 `${CAPTCHA_KEY}:${captchaId}`，**TTL 120 秒**；返回 `{ captchaId, imageBase64: toSvgDataUri(svg) }`。
  - **两个控制器**（前缀不同，不能合并到一个类里）：
    - `subscription.controller.ts` → `@Controller('portal')`，`@Public() @Get('captcha')`、`@Public() @Post('subscriptions')`
    - `admin-subscription.controller.ts` → `@Controller('admin/subscriptions')`，`@Get()`、`@Delete(':id')`
  - 控制器保持薄：只做参数绑定与调用 service。

- [ ] **Step 3: `verifyCaptcha()`**
  - 取 Redis 值；**无论对错立即 `del`**（一次性）。
  - 缺失或值不等于 `code.trim().toLowerCase()` → `throw BizException.paramInvalid('验证码错误或已过期')`。

- [ ] **Step 4: `createSubscription()`**
  - 顺序：`verifyCaptcha` → 限流检查 → 规范化邮箱 → 判断重复。
  - 限流：key `${SUBSCRIBE_RATE_KEY}:${ip}`，`incr` 后首次数设置 `expire` 3600 秒；计数 `> 5` → `throw BizException.tooManyRequests('提交过于频繁，请稍后再试')`（该工厂方法已存在于 `biz.exception.ts`，直接复用，不要新增异常类型）。
  - 邮箱规范化：`dto.email.trim().toLowerCase()`。
  - 已存在 → 返回 `{ duplicated: true }`，**不新建记录**。
  - 不存在 → 新建，`sourceIp = ip`、`userAgent = ua.slice(0, 512)`，返回 `{ duplicated: false }`。

- [ ] **Step 5: 后台订阅列表与删除**
  - `listSubscriptions`：分页；`email` 模糊、`startTime`/`endTime` 过滤；排序 `createdAt desc`；映射为 `SubscriptionVo`（字符串化的时间，复用 `formatDateTime`）。
  - `removeSubscription`：不存在抛 `notFound`。
  - 控制器权限码：列表 `system:subscribe:list`，删除 `system:subscribe:delete`，删除方法加 `@OperationLog({ module: 'system:subscribe', action: 'delete', targetType: 'subscription' })`。

- [ ] **Step 6: 验证**
  - `pnpm --filter @sanmuzi/backend typecheck` → 0 错误。
  - 报告里贴出：`GET /api/portal/captcha` 的真实响应片段（`imageBase64` 前缀必须是 `data:image/svg+xml;base64,`）。

### Task B: 后端 · 分类与操作日志（成员 B）

**写入范围：** `backend-nest/src/modules/blog-category/**`、`backend-nest/src/modules/operation-log/**`、`backend-nest/src/common/interceptors/operation-log.interceptor.ts`、`backend-nest/src/common/decorators/operation-log.decorator.ts`
**允许的最小改动：** 在各 controller 上加 `@OperationLog` 装饰器（只加装饰器，不改业务逻辑）；`blog.service.ts` 增加 `categoryId` 的读写与 `categoryName` 回填。

**Produces:** 接口 `GET/POST/PUT/DELETE /api/admin/categories`、`GET /api/admin/operation-logs`；拦截器与装饰器

- [ ] **Step 1: `@OperationLog` 装饰器**
  - `OPERATION_LOG_KEY = 'operation_log_meta'`；`OperationLogMeta = { module: string; action: string; targetType?: string }`。
  - 用 `SetMetadata` 实现，导出 `OperationLog(meta)`。

- [ ] **Step 2: `OperationLogInterceptor`**
  - 读 `Reflector.getAllAndOverride(OPERATION_LOG_KEY, [handler, class])`；无元数据放行。
  - 仅当 `request.user?.userId` 存在且方法属于 `POST/PUT/PATCH/DELETE` 才记录。
  - 计时并在 `tap`（成功，`result=1`）与 `catchError`（失败，`result=0` + `errorMessage`，**原样 rethrow**）中写库。
  - `targetId` 取 `request.params?.id`（`Number.isFinite(Number(...))` 才用）。
  - 写库 `await` 且整体 `try/catch`：失败只 `logger.warn`。
  - `adminUsername` 从「已登录用户」取：`request.user` 只有 `userId`/`roleId`，**需要查库拿 username**；为控制成本，可在拦截器内 `prisma.adminUser.findUnique({ where: { id }, select: { username: true } })`，查不到写 `unknown`。
  - 在 `app.module.ts` 的 `APP_INTERCEPTOR` 之外由主理人注册顺序——**若需调整注册顺序，向主理人提出，不要自行改 `app.module.ts`**。

- [ ] **Step 3: `BlogCategoryService`**
  - `listAll()`：查全部分类，`_count.adminUsers`→文章数用 `_count.blogArticles`；排序 `sort desc, id asc`。
  - `create`：名称唯一（重名抛 `conflict`）；`sort` 默认 0。
  - `update`：改名时查重名；不存在抛 `notFound`。
  - `remove`：先 `count` 该分类下文章数，`> 0` 抛 `conflict(\`该分类下还有 N 篇文章，请先调整文章分类后再删除\`)`。
  - 控制器权限码：`blog:category:list/create/update/delete`；写操作加 `@OperationLog`。

- [ ] **Step 4: 文章与分类的关联读写**
  - `blog.service.ts`：`LIST_SELECT` 增加 `categoryId` 与 `category: { select: { name: true } }`；`toListItem`/`toDetail` 回填 `categoryId` 与 `categoryName`。
  - 创建/更新文章时接受并写入 `categoryId`（`null` 表示未分类）；`categoryId` 指向不存在的分类时，让 Prisma 的 `P2003` 走全局过滤器（映射为 `40900`），或显式校验后抛 `paramInvalid('分类不存在')` —— **选后者**，错误信息更明确。
  - **注意**：这是对既有 `blog.service.ts` 的修改，属于成员 B 的独占范围，成员 A/C/D 不要碰这个文件。

- [ ] **Step 5: 给既有写操作接上日志**
  - 在 `blog.controller.ts`、`admin-user.controller.ts`、`admin-role.controller.ts` 的写方法上加 `@OperationLog`，模块名分别用 `blog:article`、`system:user`、`system:role`，动作 `create`/`update`/`delete`。
  - 只加装饰器，不改动这些方法的方法体。

- [ ] **Step 6: 操作日志查询**
  - `list(query)`：分页；`adminUsername` 模糊、`module` 精确、`result` 精确、时间区间过滤；排序 `createdAt desc`；映射为 `OperationLogVo`。
  - 控制器 `system:oplog:list`。

- [ ] **Step 7: 验证**
  - `pnpm --filter @sanmuzi/backend typecheck` → 0 错误。
  - 报告里贴出：拦截器注册方式、以及「分类新增后 operation log 里应出现的字段」的代码依据。

### Task C: 后台前端（成员 C）

**写入范围：** `web-portal/src/admin/**`（**除了** 冻结的 `admin/api/**`、`admin/config/index.ts`、`admin/components/icons.ts`、`admin/router/routes.ts`）

**Consumes:** 冻结的 API 函数与 `CategoryVo`/`SubscriptionVo`/`OperationLogVo` 类型

- [ ] **Step 1: 分类管理页** `admin/views/blog/CategoryListView.vue`
  - 参考 `admin/views/system/RoleListView.vue` 的结构（`NCard` + `NDataTable` + `NModal` 表单）。
  - 列表列：ID、名称、排序、文章数、更新时间、操作（编辑 / 删除）。
  - 新增/编辑弹窗：名称（必填、≤64）、排序（`NInputNumber`）。
  - 删除：`NPopconfirm`；被占用时显示后端返回的 40900 消息。
  - 按钮权限：新增 `v-permission="PERMISSIONS.BLOG_CATEGORY_CREATE"`，删除同 `DELETE`。

- [ ] **Step 2: 邮件订阅页** `admin/views/system/SubscriptionListView.vue`
  - 参考 `admin/views/system/LoginLogView.vue`（含时间筛选）。
  - 列：ID、邮箱、留言（超长截断 + `title` 显示全文）、来源 IP、订阅时间、操作（删除）。
  - 筛选：邮箱输入 + `NDatePicker` 时间区间。

- [ ] **Step 3: 操作日志页** `admin/views/system/OperationLogView.vue`
  - 列：时间、操作人、模块、动作、目标、IP、结果（`NTag` 成功/失败）、失败原因。
  - 筛选：操作人输入、模块输入、结果下拉、时间区间。

- [ ] **Step 4: 文章编辑页加分类下拉**
  - 在「发布设置」区块加「分类」`NSelect`（`clearable`，选项来自 `fetchCategories()`，`value` 用 `categoryId`）。
  - 提交时带上 `categoryId`（未选为 `null`）。

- [ ] **Step 5: 验证**
  - `pnpm --filter @sanmuzi/web-portal exec vue-tsc --noEmit -p tsconfig.app.json` → 0 错误。
  - **不要跑 `pnpm portal:build`**（共享 dist，会与成员 D 冲突）。

### Task D: 前台前端（成员 D）

**写入范围：** `web-portal/src/views/CategoryListView.vue`、`views/CategoryDetailView.vue`、`views/SubscribeView.vue`、`web-portal/src/components/CaptchaField.vue`

**Consumes:** 冻结的 `fetchCaptcha`、`submitSubscription`、`fetchPortalCategories`、`fetchPortalCategoryArticles`

- [ ] **Step 1: 验证码组件** `components/CaptchaField.vue`
  - props：`modelValue`（用户输入的码）、`captchaId`；emits：`update:modelValue`、`update:captchaId`。
  - 挂载时调用 `fetchCaptcha()` 取图；**用 `<img :src="imageBase64">` 渲染，禁止 `v-html`**。
  - 点击图片重新获取；暴露 `refresh()` 供父组件在提交失败时刷新（`defineExpose`）。

- [ ] **Step 2: 订阅页** `views/SubscribeView.vue`
  - 字段：邮箱（必填，前端先做格式校验）、留言（选填，`maxlength=200`，占位文案写明「可留空」）、验证码。
  - 提交成功 → 成功态；`duplicated: true` 时文案为「这个邮箱已经订阅过了」。
  - **验证码错误时只刷新验证码，不清空邮箱与留言**。
  - 失败提示放在表单内（不要用 `alert`）。

- [ ] **Step 3: 分类总览页** `views/CategoryListView.vue`
  - 列出全部分类与各自文章数，点击进入 `/category/:id`；无分类时用 `EmptyState`。

- [ ] **Step 4: 分类文章列表** `views/CategoryDetailView.vue`
  - 复用 `BlogCard`、`ArticleCardSkeleton`、`EmptyState` 与首页的卡片网格样式；含分页（「查看更多」）。
  - 分类不存在（40400）时显示空态；顶部显示分类名与返回入口。

- [ ] **Step 5: 验证**
  - `pnpm --filter @sanmuzi/web-portal exec vue-tsc --noEmit -p tsconfig.app.json` → 0 错误。
  - **不要跑 `pnpm portal:build`**。

---

## Phase 2 · 集成与验收（主理人执行）

### Task E: 集成构建与接口冒烟

- [ ] `pnpm --filter @sanmuzi/backend typecheck && pnpm --filter @sanmuzi/backend build`，重启后端。
- [ ] `scripts/smoke.ps1` 扩容（**注意保持 UTF-8 BOM**），新增断言：
  - 验证码：获取成功且 `imageBase64` 以 `data:image/svg+xml;base64,` 开头
  - 订阅：正确验证码 → 成功；同邮箱再提交 → `duplicated: true` 且订阅总数不增
  - 验证码一次性：复用同一 `captchaId` 必然 `40000`
  - 伪造 `captchaId` → `40000`
  - 限流：连续 6 次提交 → 第 6 次 `42900`
  - 分类：新增 → 改名 → 重复名 `40900` → 删除；删除有文章的分类 `40900`
  - 订阅列表：分页 + 按邮箱筛选；删除后记录消失
  - 操作日志：一次分类新增后能查到对应记录（module/action/result 正确）
  - 权限：内容编辑可读分类列表、写分类 `40300`、读订阅列表 `40300`、读操作日志 `40300`
  - 未登录访问上述后台接口 `40100`
- [ ] 跑通全部断言，记录真实输出。

### Task F: 前台 UI 验证

- [ ] 新增 `scripts/verify-subscribe-category-ui.mjs`（无头 Chrome，真实键鼠），断言：
  - `/subscribe` 渲染出邮箱、留言、提交按钮；验证码是 `<img>` 且 `src` 以 `data:image/svg+xml;base64,` 开头（**确认没有走 `v-html`**）
  - 空邮箱提交不产生网络请求
  - 用后端真实答案填验证码 → 提交成功
  - 错误验证码 → 表单内提示错误，且验证码图片 `src` 已变化（确实刷新了）
  - `/category` 分类数与接口一致；点击进入 `/category/:id` 并渲染卡片
  - 后台三个新页面渲染正常，文章编辑页存在分类下拉且能选中
  - 控制台 0 报错、无真实失败请求
- [ ] 加入根 `package.json` 的 `verify:all`。

### Task G: 文档、全量回归、推送

- [ ] 更新 `docs/API.md`（验证码、订阅、分类、操作日志四组接口 + 权限码总览）
- [ ] 更新 `docs/UPDATE_LOG.md`（v1.3.0：范围、实现、验证证据、修掉的问题、6 项已知限制原样带上）
- [ ] 更新 `README.md` 脚本表（断言总数以实测为准）
- [ ] `pnpm verify:all` 全绿；`pnpm backend:cache:flush`
- [ ] 提交并推送 `origin main`

---

## 完成标准

- [ ] 前台 `/subscribe` 能带验证码提交，成功与重复订阅都有正确文案
- [ ] 后台「邮件订阅」页能看到前台提交的邮箱与留言
- [ ] 后台「分类管理」可增删改；文章编辑页可设置分类；分类被占用时不能删除
- [ ] 后台「操作日志」能查到分类新增等写操作，含操作人、模块、动作、IP、结果
- [ ] 7 个新权限码生效：内容编辑读分类列表 200、写分类 403、订阅与日志 403
- [ ] 验证码一次性、限流 42900、伪造 ID 40000 均有断言覆盖
- [ ] `pnpm verify:all` 全绿（含新增的订阅/分类 UI 套件）
- [ ] 迁移已应用、seed 含演示分类、`docs/UPDATE_LOG.md` 写明 6 项已知限制
