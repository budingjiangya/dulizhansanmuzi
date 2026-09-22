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

### GET /api/portal/articles/:id

文章详情，额外返回 `content`（富文本 HTML）。未上架或已删除的文章统一返回 `40400`。

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

内置角色：

- **超级管理员**（`roleId = 1`）：拥有全部权限码；
- **内容编辑**（`roleId = 2`）：仅 `blog:article:*` 五项，访问 `/api/admin/users`、`/api/admin/login-logs` 等接口会被后端直接拒绝（`40300`）。

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
