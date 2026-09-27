# 邮件订阅 + 分类模块 + 通用操作日志 · 设计文档

日期：2026-09-27
范围：第二批（第一批「关于本站 + 站内搜索」已于 v1.2.0 交付）
状态：设计已确认，待实现

## 一、需求

1. **邮件订阅**：前台点击「邮件订阅」进入表单 → 填邮箱 + 留言内容 + 图形验证码 → 提交成功 → 后台新增「邮件订阅」页展示。
2. **分类模块**：后台可新增分类，并可给文章设置分类。
3. **智能体团队**：本批需求由 Agent Team 并行落地。
4. **所有改善都要支持日志与权限**。

## 二、已确认的决策

| 决策点 | 结论 |
| --- | --- |
| 验证码形式 | 图形验证码（服务端生成 SVG，存 Redis，一次性使用），不依赖外部邮件服务 |
| 日志范围 | 通用操作日志（新建表 + 后台页面）+ 订阅业务记录（单独表 + 单独页面） |
| 留言字段 | 选填，可留空 |
| 邮件通知形态 | 「后台新增邮件通知」理解为后台新增订阅记录列表页（不含真实发信） |

### 已确认的默认值

- 权限划分：超管拥有全部新权限；内容编辑只获得 `blog:category:list`（写文章时选分类用），**不能**增删改分类，也看不到订阅与操作日志。
- 分类与文章是**一对多**（一篇文章属于一个分类，可为空）。

## 三、数据模型

### 3.1 新增表

**`blog_category`（分类）**

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | Int PK | 自增 |
| name | VarChar(64) 唯一 | 分类名 |
| sort | Int 默认 0 | 排序权重，越大越靠前 |
| createdAt / updatedAt | DateTime | 时间戳 |

**`blog_subscription`（邮件订阅）**

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | Int PK | 自增 |
| email | VarChar(160) 唯一 | 订阅邮箱 |
| message | Text 可空 | 用户留言，可留空 |
| sourceIp | VarChar(128) | 来源 IP |
| userAgent | VarChar(512) 可空 | 来源 UA |
| status | Int 默认 1 | 1 有效 / 0 已退订（为后续预留） |
| createdAt / updatedAt | DateTime | 时间戳 |

**`admin_operation_log`（操作日志）**

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | Int PK | 自增 |
| adminUserId | Int 可空 | 操作人 id（账号被删后置空，保留日志） |
| adminUsername | VarChar(64) | 操作人账号**快照**（账号改名或删除后日志仍可读） |
| module | VarChar(32) | 模块，如 `blog:category` |
| action | VarChar(32) | 动作，如 `create` / `update` / `delete` |
| targetType | VarChar(32) 可空 | 目标类型，如 `category` |
| targetId | Int 可空 | 目标 id |
| summary | VarChar(255) 可空 | 人类可读摘要 |
| requestMethod | VarChar(8) | HTTP 方法 |
| requestPath | VarChar(255) | 请求路径 |
| operationIp | VarChar(128) | 操作来源 IP |
| result | Int | 1 成功 / 0 失败 |
| errorMessage | VarChar(512) 可空 | 失败原因 |
| createdAt | DateTime | 时间 |

索引：`adminUserId`、`module`、`createdAt`。

### 3.2 修改表

`BlogArticle` 增加 `categoryId Int?` + 索引 `@@index([categoryId])`，关联 `BlogCategory`，`onDelete: Restrict`——**分类下有文章时数据库层面就拒绝删除**（服务层再给出友好提示，返回 `40900`）。

## 四、验证码

### 4.1 获取

`GET /api/portal/captcha`（`@Public()`）

响应：

```json
{
  "code": 0,
  "data": {
    "captchaId": "c8f1a2...",
    "imageBase64": "data:image/svg+xml;base64,PHN2ZyB4bWxucz0i..."
  }
}
```

设计要点：

- 服务端生成 4 位字符验证码（`svg-captcha`，自带 TypeScript 声明），**返回已编码好的 data URI**。
- 前端直接 `<img :src="imageBase64">`，**不使用 `v-html`**——避免引入注入面。
- 答案存 Redis `sanmuzi:captcha:<captchaId>`，**TTL 120 秒**，值为小写答案。
- `captchaId` 用随机 UUID，不含答案，客户端无法自行校验。

### 4.2 校验

- 大小写不敏感（统一转小写比较）。
- **一次性**：无论校验成功或失败，校验后立即删除该 key。防止同一验证码被反复尝试。
- 失败返回 `40000`，消息「验证码错误或已过期」。

## 五、公开订阅接口

`POST /api/portal/subscriptions`（`@Public()`）

请求体：

```json
{ "email": "a@b.com", "message": "想看键盘评测", "captchaId": "...", "captchaCode": "a1b2" }
```

校验规则：

| 字段 | 规则 |
| --- | --- |
| email | 必填、`IsEmail`、≤160 字 |
| message | 选填、≤200 字（可留空） |
| captchaId / captchaCode | 必填 |

处理顺序与结果：

| 场景 | 结果 |
| --- | --- |
| 验证码错误或过期 | `40000`「验证码错误或已过期」 |
| 同 IP 一小时超过 5 次提交 | `42900`（Redis 计数限流） |
| 邮箱已存在 | `code: 0` + `data: { duplicated: true }`，**不新建记录**，前端提示「这个邮箱已经订阅过了」 |
| 成功 | `code: 0` + `data: { duplicated: false }`，写入订阅表 |

响应**不返回订阅记录明细**（邮箱与留言不回显，避免信息泄露），只返回 `{ duplicated }`。

去掉邮箱两端空格并统一转小写后入库，避免 `A@b.com` 与 `a@b.com` 被当成两个订阅。

## 六、后台接口与权限码

### 6.1 新增权限码

| 权限码 | 说明 |
| --- | --- |
| `blog:category:list` | 查看分类列表 |
| `blog:category:create` | 新增分类 |
| `blog:category:update` | 编辑分类 |
| `blog:category:delete` | 删除分类 |
| `system:subscribe:list` | 查看订阅列表 |
| `system:subscribe:delete` | 删除订阅记录 |
| `system:oplog:list` | 查看操作日志 |

内建角色分配：

- **超级管理员**：全部权限（与现有做法一致，取 `ALL_PERMISSIONS`）。
- **内容编辑**：在原有 5 项文章权限之上，**只增加 `blog:category:list`**。

### 6.2 接口清单

| 方法 | 路径 | 权限码 |
| --- | --- | --- |
| GET | `/api/admin/categories` | `blog:category:list` |
| POST | `/api/admin/categories` | `blog:category:create` |
| PUT | `/api/admin/categories/:id` | `blog:category:update` |
| DELETE | `/api/admin/categories/:id` | `blog:category:delete` |
| GET | `/api/admin/subscriptions` | `system:subscribe:list` |
| DELETE | `/api/admin/subscriptions/:id` | `system:subscribe:delete` |
| GET | `/api/admin/operation-logs` | `system:oplog:list` |

- 分类列表返回数组（与 `GET /api/admin/roles` 一致，不分页），并带 `articleCount`。
- 分类删除：被文章占用时返回 `40900`，消息说明还有几篇文章在用。
- 订阅列表：分页，支持按 `email` 模糊、`startTime` / `endTime` 筛选。
- 操作日志：分页，支持按 `adminUsername`、`module`、`result`、`startTime` / `endTime` 筛选。

`GET /api/admin/categories` 与文章列表**必须**返回 `categoryId` 与 `categoryName`，供后台文章编辑页回填与列表展示。

## 七、操作日志的实现

全局拦截器 `OperationLogInterceptor`（在 `TransformInterceptor` 之后、业务处理之外）：

1. 读取 `Reflector` 上的 `@OperationLog({ module, action, targetType? })` 元数据；未声明的路由直接放行。
2. 仅记录**后台已鉴权**的写操作——`request.user` 存在且 HTTP 方法属于 `POST/PUT/PATCH/DELETE`；公开接口不记录（匿名操作记了没有价值，且会被刷）。
3. 业务成功 → 记录 `result = 1`；业务抛错 → 记录 `result = 0` 并写入 `errorMessage`，然后**原样抛错**（不吞异常、不改变错误响应）。
4. 写日志**与业务同请求内完成**（`await`），并用 `try/catch` 包裹：写日志失败只输出告警，**绝不影响业务响应**。不使用 fire-and-forget 异步写——进程退出会丢记录，无法验证。
5. `targetId` 从路由参数 `:id` 读取；`summary` 由各 controller 通过可选回调提供（拿不到就留空，不编造内容）。

接线范围（既做通用日志，就接到现有写操作上，日志页才有内容）：

- 新增：分类增删改、订阅删除
- 既有：文章增删改与上下架/推荐/排序、账号增删改与重置密码、角色增删改

操作日志自身的查询是只读 GET，天然不会触发日志，不存在递归。

## 八、页面

### 8.1 后台

| 位置 | 页面 | 说明 |
| --- | --- | --- |
| 内容运营 → 分类管理 | 列表 + 新增/编辑/删除 | 字段：名称、排序；显示每个分类下的文章数；删除被占用时提示具体数量 |
| 系统管理 → 邮件订阅 | 列表 + 删除 | 字段：邮箱、留言、来源 IP、订阅时间；支持按邮箱与时间筛选 |
| 系统管理 → 操作日志 | 列表 | 字段：时间、操作人、模块、动作、目标、IP、结果；支持按时间/操作人/模块筛选；失败记录显示错误原因 |
| 文章编辑页 | 新增「分类」下拉（选填） | 放在「发布设置」区块 |

菜单按权限码过滤，按钮用现有 `v-permission` 指令控制——内容编辑看不到订阅与操作日志，也看不到分类的新增/删除按钮。

### 8.2 前台（替换两个占位页）

| 路由 | 页面 |
| --- | --- |
| `/category` | 分类总览：列出全部分类与各自文章数，点击进入该分类 |
| `/category/:id` | 该分类下的文章列表，复用卡片网格、骨架屏与分页 |
| `/subscribe` | 订阅表单：邮箱 + 留言（选填，标注「可留空」）+ 图形验证码 + 提交 |

订阅表单交互：

- 验证码图片初始加载；点击图片可刷新（重新获取）。
- 提交成功后显示成功态（含「已订阅过」与「订阅成功」两种文案）。
- 提交失败（验证码错误/限流/网络错误）在表单内提示，**不清空已填内容**——验证码错误时只刷新验证码，避免用户重填邮箱。
- 空邮箱、格式错误在前端先拦一次，减少无谓请求。

头部导航的「分类」「邮件订阅」入口第一批已在位，本批**不需要改导航**。

## 九、错误处理与边界

| 场景 | 期望行为 |
| --- | --- |
| 验证码 ID 不存在（伪造） | `40000`「验证码错误或已过期」 |
| 验证码重复使用 | 第二次必然失败（一次性） |
| 同 IP 高频提交 | 第 6 次起 `42900` |
| 邮箱大小写不同但同一地址 | 视为同一订阅，返回 `duplicated: true` |
| 留言超长 | `40000`（前端 `maxlength=200` + 后端二次校验） |
| 分类重名 | `40900` |
| 删除有文章的分类 | `40900`，消息写明剩余文章数 |
| 分类不存在 | `40400` |
| 内容编辑调用分类写接口 | `40300`（后端二次鉴权，不依赖前端隐藏） |
| 未登录调用操作日志 | `40100` |
| 操作日志写入失败 | 只告警，业务响应不受影响 |

## 十、验证方式

### 10.1 `scripts/smoke.ps1` 扩容

- 验证码：获取成功且返回 `data:image/svg+xml;base64,` 前缀；ID 不存在时提交返回 `40000`
- 订阅：正确验证码提交成功；同邮箱再次提交返回 `duplicated: true` 且记录数不增；验证码一次性（复用同一 ID 必然失败）
- 限流：连续提交触发 `42900`
- 分类：CRUD 全流程；重名 `40900`；删除有文章的分类 `40900`（需先建一篇文章挂到该分类，验证后清理）
- 订阅列表：分页与按邮箱筛选；删除后记录消失
- 操作日志：执行一次分类新增后，日志页能查到该操作（模块、动作、结果正确）；`result=0` 的记录带错误信息
- 权限：内容编辑可读分类列表、写分类返回 `40300`、读订阅列表与操作日志返回 `40300`
- 未登录调用上述后台接口返回 `40100`

### 10.2 新增 `scripts/verify-subscribe-category-ui.mjs`

前台（真实鼠标与键盘）：

- `/subscribe` 渲染出邮箱、留言、验证码图片与提交按钮；验证码是 `<img>` 且 `src` 以 `data:image/svg+xml;base64,` 开头（确认没有走 `v-html`）
- 空邮箱提交不产生请求；填合法邮箱 + 从后端取真实验证码答案提交 → 成功态
- 错误验证码提交 → 表单内提示错误，且验证码图片已刷新
- `/category` 列出分类且文章数与接口一致；点击分类进入 `/category/:id` 并渲染文章卡片

后台：分类管理页 CRUD 走一遍（真实点击）；文章编辑页存在分类下拉且能选中；订阅列表能看到刚提交的邮箱；操作日志页能查到刚发生的分类新增操作。

### 10.3 回归

`pnpm verify:all` 五套 + 新增一套，全部通过；`web-portal` 与 `backend` 构建 0 错误。

## 十一、智能体团队分工

先由主理人冻结接口（契约 + Prisma 模型与迁移 + `app.module` 装配 + 路由/API 层骨架 + 页面占位文件），保证任意时刻构建为绿，再并行派成员。

| 成员 | 写入范围 | 交付 |
| --- | --- | --- |
| A 后端-订阅 | `backend-nest/src/modules/subscription/**`、`common/utils/captcha.util.ts` | 验证码获取/校验、公开订阅接口、后台订阅列表与删除 |
| B 后端-分类与日志 | `backend-nest/src/modules/blog-category/**`、`modules/operation-log/**` | 分类 CRUD、操作日志拦截器与查询、接线到既有写操作 |
| C 后台前端 | `web-portal/src/admin/**` | 三个新页面 + 文章编辑页分类下拉 + 菜单与按钮权限 |
| D 前台前端 | `web-portal/src/views/**`、`web-portal/src/components/**` | 分类总览、分类文章列表、订阅表单（含验证码） |
| 主理人 | 契约、Prisma、装配、路由/API 骨架、验证脚本、集成构建、最终验收 | 全量回归与文档 |

规则：

- 成员之间**不共用可写文件**；共享文件（`contracts/`、`prisma/schema.prisma`、`app.module.ts`、`router/index.ts`、`api/*`）由主理人在冻结阶段一次性写完，成员只读。
- 成员**只跑类型检查**（`pnpm --filter @sanmuzi/backend typecheck`、`pnpm --filter @sanmuzi/web-portal exec vue-tsc --noEmit -p tsconfig.app.json`），**不跑构建**——构建产物是共享目录，并发构建会互相覆盖。构建与验证由主理人串行执行。
- 成员交付必须附**真实执行的命令与输出**；主理人独立复验后才计入完成。

## 十二、已知限制（明示，不计入已完成）

1. **不发真实邮件**。「邮件订阅」只落库并在后台展示，没有 SMTP 配置、不引入 `nodemailer`。若将来要发确认信或推送，需要提供 SMTP 凭据。
2. **验证码为自托管方案**，未做难度对抗评估（`svg-captcha` 默认强度）。配合一次性使用 + IP 限流，对本项目的防刷需求足够。
3. **限流按 IP 计数存 Redis**，Nginx 之后需正确透传 `X-Forwarded-For`，否则会把所有用户算作同一 IP。
4. **操作日志无归档与清理策略**，长期运行会持续增长。数据量大后需要定期归档。
5. **订阅无退订入口**（`status` 字段已预留），用户目前无法自助退订。
6. **不做订阅导出**（CSV/Excel）。需要时再加。
