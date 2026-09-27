# 接口文档

后端服务基地址：`http://localhost:3000`，全局前缀 `/api`。
在线调试（Swagger UI）：`http://localhost:3000/api/docs`。

## 一、通用约定

### 1.1 统一响应包装

所有接口（含错误）都返回同一结构，前端只解析一层：

```json
{
  "code": 0,
  "message": "ok",
  "data": {},
  "timestamp": 1767225600000,
  "traceId": "可选，仅出错时返回"
}
```

`code === 0` 表示成功，其余为业务错误。业务错误同样返回 HTTP 200 与正确的 HTTP 语义码（见 1.3）。

### 1.2 分页

请求参数统一为 `page`（从 1 开始，默认 1）与 `pageSize`（默认 10，上限 100）。
分页响应统一为：

```json
{ "list": [], "total": 0, "page": 1, "pageSize": 10, "totalPages": 0 }
```

### 1.3 业务错误码

| code | HTTP | 含义 |
| --- | --- | --- |
| 0 | 200 | 成功 |
| 40000 | 400 | 参数校验失败（`message` 为具体字段提示） |
| 40100 | 401 | 未登录、Token 无效或已过期、账号被禁用 |
| 40300 | 403 | 已登录但当前角色无该接口权限 |
| 40400 | 404 | 资源不存在（含前台访问未上架文章） |
| 40900 | 409 | 业务冲突（账号重复、角色被占用、删除最后一个超管等） |
| 42900 | 429 | 登录失败次数过多，触发限流 |
| 50000 | 500 | 服务端异常 |

### 1.4 鉴权

除标注「公开」的接口外，均需携带请求头：

```
Authorization: Bearer <token>
```

Token 载荷只包含 `userId` 与 `roleId`，**不含权限数组**；后端 `PermissionsGuard` 每次请求实时查库读取角色权限，因此权限变更后无需重新登录即可生效，旧 Token 也不会保留已回收的权限。

### 1.5 资源地址

上传接口返回站内相对地址，例如 `/static/uploads/blog/2026/05/ab12cd.jpg`：

- 后端静态托管：`http://localhost:3000/static/uploads/...`
- 开发环境前台/后台通过 Vite 代理 `/static` 到后端，因此前端可直接使用相对地址；生产环境由 Nginx 托管同一路径。

---

## 二、鉴权接口

### POST /api/auth/login —— 公开

登录成功与失败都会写入登录日志。同一账号 + IP 在窗口内失败次数超限会返回 `42900`。

请求体：

```json
{ "username": "admin", "password": "Admin@123456" }
```

响应 `data`：

```json
{
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "expiresAt": 1767232800000,
  "user": {
    "id": 1,
    "username": "admin",
    "realName": "超级管理员",
    "roleId": 1,
    "roleName": "超级管理员",
    "status": 1,
    "permissions": ["blog:article:list", "system:user:list", "..."],
    "lastLoginAt": "2026-05-20T09:12:33.000Z"
  }
}
```

### GET /api/auth/profile —— 需登录

返回当前登录管理员信息（含实时权限数组），用于前端菜单与按钮显隐。

### POST /api/auth/change-password —— 需登录

```json
{ "oldPassword": "Admin@123456", "newPassword": "NewPass@2026" }
```

校验旧密码后以 bcrypt 重新加密存储；旧密码错误返回 `40000`。

---

## 三、前台门户接口（全部公开）

> 已在 v1.1.0 调整为单应用双区域：前端由同一个应用提供，访客端在 `/`，管理后台在 `/admin`。
> 接口路径与鉴权规则完全不变。

### GET /api/portal/site-config

返回站点名称、副标题、描述、导航与页脚文案。

### GET /api/portal/articles

首页卡片列表。只返回 `isRecommend = true` 且 `isPublish = true` 的文章，排序规则 `sort DESC, id DESC`，**不返回富文本正文 `content`**（首页轻量化）。结果按 `PORTAL_CACHE_TTL` 秒缓存于 Redis，文章任何写操作都会立即清除该缓存。

查询参数：`page`、`pageSize`。

`list` 单项结构：

```json
{
  "id": 3,
  "title": "这块 27 寸 4K 显示器，我用了两年",
  "shortDesc": "一句话推荐理由，显示在卡片标题下方",
  "coverType": "video",
  "coverImages": [],
  "coverVideo": "/static/uploads/demo/trailer.mp4",
  "coverVideoFrame": "/static/uploads/blog/2026/05/frame-9a1b.jpg",
  "isRecommend": true,
  "isPublish": true,
  "sort": 40,
  "createdAt": "2026-05-01T02:10:00.000Z",
  "updatedAt": "2026-05-18T07:22:11.000Z"
}
```

`coverType` 取值：

- `image`：`coverImages` 为多张封面图数组，前台 hover 自动轮切；
- `video`：`coverVideoFrame` 为静态封面帧（前台默认展示），`coverVideo` 为 hover 时才加载的短视频。

### GET /api/portal/articles/search

站内搜索。按关键词匹配**标题、摘要与富文本正文**（三者 OR 关系），覆盖**全部已上架文章**（不限于首页推荐位）。

| 参数 | 必填 | 说明 |
| --- | --- | --- |
| `keyword` | 是 | 1–50 字（前后空格会被 trim）；为空、全空格或超长均返回 `40000` |
| `page` / `pageSize` | 否 | 与其他列表接口一致，`pageSize` 上限 100 |

- 排序：`sort DESC, updatedAt DESC`，与首页卡片的编辑权重观一致。
- 响应：`PageResult<ArticleListItemVo>`，**不含 `content`**（列表轻量化）。
- 无命中时返回 `code: 0` 且 `total: 0`，**不是错误**。
- **不做 Redis 缓存**：每个不同关键词都会产生一个缓存键，命中率极低且会污染缓存空间。这也是它不能复用首页列表缓存路径的原因之一。

```bash
curl -s "http://localhost:3000/api/portal/articles/search?keyword=%E6%98%BE%E7%A4%BA%E5%99%A8&page=1&pageSize=9"
```

### GET /api/portal/articles/:id

文章详情，额外返回 `content`（富文本 HTML）。未上架或已删除的文章返回 `40400`。

> **可见性规则变更（v1.2.0）**
>
> 该接口此前要求 `isPublish && isRecommend`，现已对齐为**只校验 `isPublish`**。
>
> 理由：`isPublish` 决定「能否被访问」，`isRecommend` 只决定「是否出现在首页推荐位」。推荐位是展示位置，不应兼任访问权限。若不改，站内搜索会返回「已上架但未推荐」的文章，而用户点进去得到 404。
>
> 影响：已上架但未推荐的文章，从此可通过直接 URL 访问（此前会 404）。首页推荐列表 `GET /api/portal/articles` 的规则（`isRecommend && isPublish`）**保持不变**。

### GET /api/portal/captcha

获取图形验证码（公开，无需登录，**不缓存**）。

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "captchaId": "dc30e842-29a7-4703-a70c-28654f0a589d",
    "imageBase64": "data:image/svg+xml;base64,PHN2ZyB4bWxucz0i..."
  },
  "timestamp": 1790472384870
}
```

- `imageBase64` 是**已经编码好的 data URI**，前端直接 `<img :src="data.imageBase64">`。
- **前端不要用 `v-html` 渲染这个 SVG**——走 `<img src>` 可以完全避免注入面。
- `captchaId` 只是标识，不含答案。答案存在服务端 Redis，TTL **120 秒**，且**一次性使用**（校验后无论对错立即失效）。
- 校验失败统一返回 `40000`「验证码错误或已过期」——伪造的 `captchaId` 与输错、过期返回同一个错误，不泄露「这个 id 存不存在」。

### POST /api/portal/subscriptions

提交邮件订阅（公开）。

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `email` | 是 | 邮箱格式，≤160 字；入库前 trim + 转小写 |
| `message` | 否 | 留言，**选填可留空**，≤200 字 |
| `captchaId` | 是 | 上一步拿到的验证码标识 |
| `captchaCode` | 是 | 用户填写的验证码，大小写不敏感 |

处理顺序：**校验验证码 → 同 IP 限流 → 规范化邮箱 → 判重**。

| 场景 | 结果 |
| --- | --- |
| 验证码错误 / 过期 / 伪造 | `40000` |
| 同 IP 一小时内超过 5 次提交 | `42900`「提交过于频繁，请稍后再试」 |
| 邮箱此前已订阅 | `code: 0` + `data: { duplicated: true }`，**不新建记录** |
| 新邮箱 | `code: 0` + `data: { duplicated: false }` |

响应**不回显订阅明细**（邮箱与留言都不返回），只返回 `{ duplicated }`——避免任何人用这个公开接口探测「某个邮箱是否订阅过」。

```bash
# 1. 取验证码
curl -s http://localhost:3000/api/portal/captcha
# 2. 带上 captchaId 与图上字符提交
curl -s -X POST http://localhost:3000/api/portal/subscriptions \
  -H "Content-Type: application/json" \
  -d '{"email":"me@example.com","message":"想看键盘评测","captchaId":"<上一步的 id>","captchaCode":"a1b2"}'
```

### GET /api/portal/categories

全部分类（公开，不分页），按 `sort desc, id asc`。**注意有两个文章数口径**：

| 字段 | 口径 | 谁用 |
| --- | --- | --- |
| `articleCount` | 该分类下**全部**文章（含未上架草稿） | 后台分类管理页（与删除占用校验同口径） |
| `publishedArticleCount` | 该分类下**已上架**文章 | **前台分类页必须用这个** |

前台只展示已上架文章，若前台拿 `articleCount` 显示数量，会出现「显示 5 篇、点进去只有 3 篇」的不一致。

### GET /api/portal/categories/:id/articles

某分类下**已上架**文章的分页列表，按 `sort desc, id desc`，**不含 `content`**。分类不存在返回 `40400`。

---

## 四、管理后台接口

### 4.1 博客文章

| 方法 | 路径 | 权限码 | 说明 |
| --- | --- | --- | --- |
| GET | `/api/admin/articles` | `blog:article:list` | 分页列表，支持 `keyword`、`coverType`、`isRecommend`、`isPublish`、`startTime`、`endTime` |
| GET | `/api/admin/articles/:id` | `blog:article:list` | 详情（含 `content`），编辑页回填 |
| POST | `/api/admin/articles` | `blog:article:create` | 新增 |
| PUT | `/api/admin/articles/:id` | `blog:article:update` | 编辑 |
| DELETE | `/api/admin/articles/:id` | `blog:article:delete` | 删除 |
| PATCH | `/api/admin/articles/:id/publish` | `blog:article:update` | 上下架，body `{ "value": true }` |
| PATCH | `/api/admin/articles/:id/recommend` | `blog:article:update` | 首页推荐位，body `{ "value": false }` |
| PATCH | `/api/admin/articles/:id/sort` | `blog:article:update` | 排序权重，body `{ "sort": 60 }` |

新增 / 编辑请求体（`UpdateArticleDto` 为全部字段可选）：

```json
{
  "title": "文章标题",
  "shortDesc": "首页展示摘要",
  "coverType": "image",
  "coverImages": ["/static/uploads/blog/2026/05/a.jpg", "/static/uploads/blog/2026/05/b.jpg"],
  "coverVideo": null,
  "coverVideoFrame": null,
  "content": "<p>富文本 HTML</p>",
  "isRecommend": true,
  "isPublish": true,
  "sort": 50
}
```

### 4.2 资源上传与 FFmpeg 抽帧

| 方法 | 路径 | 权限码 | 说明 |
| --- | --- | --- | --- |
| POST | `/api/admin/files/image` | `blog:article:upload` | 图片直传，multipart 字段名 `file` |
| POST | `/api/admin/files/video` | `blog:article:upload` | 小视频直传，自动 ffprobe 读时长 + 随机抽帧 |
| POST | `/api/admin/files/video/chunk/init` | `blog:article:upload` | 分片会话初始化，返回已上传分片（断点续传）与秒传结果 |
| POST | `/api/admin/files/video/chunk/part` | `blog:article:upload` | 上传单个分片（`uploadId`、`chunkIndex`、`file`） |
| POST | `/api/admin/files/video/chunk/merge` | `blog:article:upload` | 合并分片 → 探测时长 → 抽帧 → 返回视频信息 |
| POST | `/api/admin/files/video/frame` | `blog:article:upload` | 对已上传视频重新抽帧，body `{ "videoUrl": "...", "time": 3 }`（`time` 省略则随机） |

图片上传响应：

```json
{ "url": "/static/uploads/blog/2026/05/ab12.jpg", "originalName": "cover.jpg", "size": 245678, "mimeType": "image/jpeg" }
```

视频上传响应：

```json
{
  "url": "/static/uploads/blog/2026/05/video-9f2c.mp4",
  "originalName": "demo.mp4",
  "size": 5242880,
  "mimeType": "video/mp4",
  "duration": 52.36,
  "resolution": "1280x720",
  "coverVideoFrame": "/static/uploads/blog/2026/05/frame-1a2b.jpg",
  "frameTime": 31.42
}
```

分片会话初始化响应：

```json
{ "uploadId": "chunk_8f3c1a", "fileHash": "demo.mp4-5242880-1767225600000", "uploadedChunks": [0, 1], "instant": false, "file": null }
```

`instant: true` 表示该 `fileHash` 此前已合并完成，`file` 直接返回视频信息（秒传）。

抽帧响应：

```json
{ "coverVideoFrame": "/static/uploads/blog/2026/05/frame-77aa.jpg", "frameTime": 3, "duration": 52.36 }
```

### 4.3 管理员账号

| 方法 | 路径 | 权限码 | 说明 |
| --- | --- | --- | --- |
| GET | `/api/admin/users` | `system:user:list` | 分页，支持 `username`、`realName`、`roleId`、`status` |
| POST | `/api/admin/users` | `system:user:create` | 新增，`username` 重复返回 `40900` |
| PUT | `/api/admin/users/:id` | `system:user:update` | 编辑；不允许禁用/降级最后一个启用的超管 |
| DELETE | `/api/admin/users/:id` | `system:user:delete` | 删除；禁止删除自己与最后一个超管 |
| POST | `/api/admin/users/:id/reset-password` | `system:user:reset-password` | 重置密码，body `{ "newPassword": "..." }` |

### 4.4 角色权限

| 方法 | 路径 | 权限码 | 说明 |
| --- | --- | --- | --- |
| GET | `/api/admin/roles` | `system:role:list` | **不分页，直接返回 `AdminRoleVo[]`**，含各角色 `userCount` |
| GET | `/api/admin/roles/options` | `system:role:list` | 与上者等价（语义化别名），供账号编辑页角色下拉使用 |
| POST | `/api/admin/roles` | `system:role:create` | 新增角色，`permissions` 为权限码数组；非法权限码返回 `40000` |
| PUT | `/api/admin/roles/:id` | `system:role:update` | 编辑角色与权限（覆盖式） |
| DELETE | `/api/admin/roles/:id` | `system:role:delete` | 删除；内置角色或仍有账号占用时返回 `40900` |

### 4.5 登录日志

`GET /api/admin/login-logs`，权限码 `system:log:list`。

查询参数：`page`、`pageSize`、`username`、`loginResult`（1 成功 / 0 失败）、`startTime`、`endTime`。

### 4.6 工作台统计

`GET /api/admin/dashboard/stats`，权限码 `blog:article:list`。

```json
{
  "articleTotal": 6,
  "articlePublished": 6,
  "articleDraft": 0,
  "recommendTotal": 6,
  "adminUserTotal": 2,
  "loginToday": 4,
  "loginFailToday": 1,
  "loginTrend": [{ "date": "2026-05-14", "success": 3, "fail": 1 }]
}
```

---

### 4.7 文章分类

| 方法 | 路径 | 权限码 |
| --- | --- | --- |
| GET | `/api/admin/categories` | `blog:category:list` |
| POST | `/api/admin/categories` | `blog:category:create` |
| PUT | `/api/admin/categories/:id` | `blog:category:update` |
| DELETE | `/api/admin/categories/:id` | `blog:category:delete` |

- 列表返回**数组不分页**（分类是有限集合，与 `GET /api/admin/roles` 一致），含 `articleCount` 与 `publishedArticleCount`。
- `name` 必填、≤64 字、**唯一**；重名返回 `40900`。
- 删除前会统计该分类下的文章数：**只要有任意一篇文章（含未上架草稿）引用该分类就拒绝删除**，返回 `40900` 并写明还剩几篇。数据库层 `onDelete: Restrict` 是第二道保险，并发场景下会兜底映射为 `40900`，不会漏成 `50000`。
- 写操作全部写入操作日志（模块 `blog:category`）。

### 4.8 邮件订阅管理

| 方法 | 路径 | 权限码 |
| --- | --- | --- |
| GET | `/api/admin/subscriptions` | `system:subscribe:list` |
| DELETE | `/api/admin/subscriptions/:id` | `system:subscribe:delete` |

- 列表分页；支持 `email` 模糊、`startTime` / `endTime` 时间区间；按 `createdAt desc, id desc` 排序。
- 删除不存在的记录返回 `40400`；删除写入操作日志（模块 `system:subscribe`）。

### 4.9 操作日志

| 方法 | 路径 | 权限码 |
| --- | --- | --- |
| GET | `/api/admin/operation-logs` | `system:oplog:list` |

- 分页；支持 `adminUsername` 模糊、`module` 精确、`result` 精确（1 成功 / 0 失败）、`startTime` / `endTime`；按 `createdAt desc, id desc` 排序。
- **记录范围**：只记录**后台已鉴权的写操作**（POST/PUT/PATCH/DELETE），且该路由声明了 `@OperationLog` 元数据。公开接口不记录（匿名操作写审计日志没有意义，且会被刷）。
- 业务失败**也会记录**：`result = 0` 并带上 `errorMessage`，然后原样抛出原异常，不改变错误响应。
- 写日志与业务**在同一请求内完成**（await），不做 fire-and-forget——否则「操作后立刻查日志」会有竞态。写库失败只输出告警，**绝不影响业务响应**。
- `targetId` 从路由参数 `:id` 读取，所以 **`POST` 新增类操作的 `targetId` 为 `null`**（路径上没有 id，不编造内容）；`PUT` / `DELETE` 类操作能正确记录目标 id。
- `adminUsername` 存的是**操作人账号快照**：账号改名或被删除后，历史日志依然可读。

---

## 五、权限码总览

定义位置：`contracts/src/enums.ts`（前后端引用同一份常量）。

| 分组 | 权限码 | 说明 |
| --- | --- | --- |
| 博客文章 | `blog:article:list` | 查看文章列表与详情 |
| | `blog:article:create` | 新增文章 |
| | `blog:article:update` | 编辑、上下架、推荐位、排序 |
| | `blog:article:delete` | 删除文章 |
| | `blog:article:upload` | 图片与视频上传、抽帧 |
| 账号管理 | `system:user:list` / `create` / `update` / `delete` | 账号增删改查 |
| | `system:user:reset-password` | 重置他人密码 |
| 角色管理 | `system:role:list` / `create` / `update` / `delete` | 角色与权限配置 |
| 登录日志 | `system:log:list` | 登录日志查询 |
| 分类管理 | `blog:category:list` | 查看分类列表 |
| | `blog:category:create` | 新增分类 |
| | `blog:category:update` | 编辑分类 |
| | `blog:category:delete` | 删除分类 |
| 邮件订阅 | `system:subscribe:list` | 查看订阅列表 |
| | `system:subscribe:delete` | 删除订阅记录 |
| 操作日志 | `system:oplog:list` | 操作日志查询 |

内置角色：

- **超级管理员**（`roleId = 1`）：拥有全部 22 个权限码；
- **内容编辑**（`roleId = 2`）：`blog:article:*` 五项 + `blog:category:list`（共 6 项）。
  额外给分类的**只读**权限是因为写文章时要选分类；但内容编辑**不能**增删改分类，也看不到邮件订阅与操作日志——访问这些接口后端直接返回 `40300`（不依赖前端隐藏菜单）。

---

## 六、调试示例

```bash
# 1. 登录拿 Token
curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"Admin@123456"}'

# 2. 前台列表（无需鉴权）
curl -s "http://localhost:3000/api/portal/articles?page=1&pageSize=3"

# 3. 带 Token 访问管理接口
curl -s http://localhost:3000/api/admin/articles?page=1 \
  -H "Authorization: Bearer <token>"

# 4. 验证 RBAC：用内容编辑的 Token 访问账号管理，应返回 40300
curl -s http://localhost:3000/api/admin/users \
  -H "Authorization: Bearer <editor-token>"

# 5. 抽帧
curl -s -X POST http://localhost:3000/api/admin/files/video/frame \
  -H "Authorization: Bearer <token>" -H "Content-Type: application/json" \
  -d '{"videoUrl":"/static/uploads/demo/ForBiggerBlazes.mp4","time":3}'
```
