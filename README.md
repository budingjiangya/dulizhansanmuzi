# 三目子 · 产品推荐博客站点

前台内容门户 + RBAC 后台管理系统，**单应用双区域**：

| 区域 | 地址 | 说明 |
| --- | --- | --- |
| 访客端 | `http://localhost:5173/` | 首页推荐卡片列表、文章详情 |
| 管理后台 | `http://localhost:5173/admin` | 登录、工作台、文章、账号、角色、登录日志 |

后台路由按需懒加载，访客端首屏不会下载 Naive-UI 与富文本编辑器（约 1.7 MB）。

```text
dulizhan/
├── contracts/      三端共享契约：统一响应包装、权限码、领域模型（唯一事实来源）
├── backend-nest/   NestJS 11 + Prisma 6 + MySQL 8.4 + Redis + FFmpeg
├── web-portal/     前端单应用：src/ 访客端 + src/admin/ 管理后台
├── docs/           接口文档、部署说明、更新记录
└── scripts/        冒烟测试与 UI 渲染验证脚本
```

## 一、技术栈

| 端 | 关键技术 | 版本 |
| --- | --- | --- |
| 访客端 | Vue / Vite / TypeScript / TailwindCSS / Vue-Router / Pinia / Axios | 3.5.43 · 6.3.5 · 5.7.3 · 4.1.14 · 4.5.1 · 2.3.1 · 1.20 |
| 管理后台 | 同左 + Naive-UI / WangEditor 5 / dayjs | — · 2.40.4 · 5.1.23 · 1.11.18 |
| 后端服务 | NestJS / Prisma / MySQL / Redis / JWT / bcrypt / FFmpeg / MinIO SDK / Swagger | 11.1.6 · 6.19.0 · 8.4 · 7.x · 11.x · 3.0 · 6.x · 8.0 · 11.2 |

## 二、环境要求

- Node.js >= 20.11（实测 22.23.2）
- pnpm >= 9（实测 12.5.1）
- MySQL 8.x（当前配置外部实例 `110.42.32.92:3306/dulizhan`）
- Redis（当前配置外部实例 `110.42.32.92:6379`）
- FFmpeg / FFprobe（视频时长探测与随机抽帧；Windows 可用 winget 安装 `Gyan.FFmpeg`）

## 三、快速启动

```bash
# 1. 安装依赖（工作区根目录）
pnpm install

# 2. 后端：生成 Prisma Client → 建表 → 灌入演示数据
pnpm backend:prisma:generate
pnpm backend:prisma:migrate     # 首次执行 prisma migrate dev --name init
pnpm backend:seed

# 3. 启动后端（默认 http://localhost:3000，Swagger: /api/docs）
pnpm backend:dev

# 4. 启动前端单应用（访客端 + 后台同一个 dev server）
pnpm portal:dev

#   访客端  http://localhost:5173/
#   管理后台 http://localhost:5173/admin
```

也可以用 `pnpm dev` 同时启动后端与前端。

演示账号（由 seed 脚本写入）：

| 账号 | 密码 | 角色 | 可见范围 |
| --- | --- | --- | --- |
| `admin` | `Admin@123456` | 超级管理员 | 全部菜单：文章、账号、角色、登录日志 |
| `editor` | `Editor@123456` | 内容编辑 | 仅文章相关菜单；账号/日志/角色接口直连也会被后端 403 拒绝 |

## 四、常用脚本

| 命令 | 说明 |
| --- | --- |
| `pnpm dev` | 并行启动后端 + 前端单应用 |
| `pnpm build` | 递归构建全部产物（后端 dist + 前端 dist） |
| `pnpm typecheck` | 递归执行类型检查 |
| `pnpm backend:prisma:migrate` | 生成并应用数据库迁移 |
| `pnpm backend:seed` | 重置并灌入演示数据（幂等，会清空业务表） |
| `pnpm backend:cache:flush` | 清空本站 Redis 缓存键（改配置后让前台立即生效） |
| `pnpm smoke` | 后端接口端到端冒烟（28 项断言） |
| `pnpm verify:portal-ui` | 访客端真实渲染验证（无头 Chrome 真实鼠标事件，19 项断言 + 截图） |
| `pnpm verify:admin-ui` | 后台真实渲染验证（无头 Chrome，30 项断言 + 截图） |
| `pnpm verify:article-edit` | 文章编辑页全链路往返（打开 → 改标题 → 保存 → 回读校验，10 项断言） |
| `pnpm verify:all` | 依次执行上述四个验证套件（共 87 项断言） |

> 三个 UI 验证脚本需要本机已安装 Chrome/Edge（脚本自动探测），截图输出到 `scripts/artifacts/`。
> 运行前请先启动后端与前端：`pnpm dev`

## 五、核心实现要点

### 5.1 RBAC 权限

- JWT 载荷**只放 `userId` 与 `roleId`**；`PermissionsGuard` 每次请求实时查库读取角色权限，权限回收后旧 Token 立即失效。
- 前端只做菜单与按钮显隐（`v-permission` 指令 + 菜单按权限码过滤），**接口层由后端守卫二次鉴权**，绕过前端直接调接口同样会被拒绝。
- 权限码定义在 `contracts/src/enums.ts`，前后端引用同一份常量。

### 5.2 视频上传与随机抽帧

1. 视频上传（小文件直传 / 大文件分片，分片会话存 Redis，支持断点续传与秒传）。
2. `ffprobe` 读取总时长与分辨率。
3. 在 `0 ~ (totalDuration - 1)` 秒区间随机取时间点。
4. `ffmpeg` 抽帧产出静态封面帧，写入 `coverVideoFrame`。
5. 后台编辑页支持指定时间点重新抽帧。

### 5.3 访客端卡片交互（性能优先）

- **多图模式**：默认渲染第一张封面；`mouseenter` 起定时器逐张轮切，`mouseleave` 立即停止并回到第一张。
- **视频模式**：默认只渲染后端抽帧的静态图；`mouseenter` 才绑定视频源并以 `muted + autoplay` 静音播放，`mouseleave` 立刻暂停并卸载 `src` 释放解码资源——**首页不预加载任何视频**。
- 列表图片 `loading="lazy"`，首屏前两张 `fetchpriority="high"`。

### 5.4 登录日志与密码

- 登录成功与失败都写入 `admin_login_log`（IP、时间、结果）；仅超级管理员可分页查询并支持时间区间筛选。
- 登录失败次数通过 Redis 限流（窗口内超过阈值锁定）。
- 管理员密码用 bcrypt 哈希存储；超管可重置他人密码，个人可自助改密。

## 六、文档

- [接口文档](docs/API.md)
- [部署说明](docs/DEPLOYMENT.md)
- [更新记录](docs/UPDATE_LOG.md)

## 七、安全提示

`backend-nest/.env` 内含当前演示环境的数据库与 Redis 明文口令，为便于本机直接启动而纳入版本管理。**正式上线前必须轮换为随机强口令，并改用环境变量或密钥管理服务注入，不要提交到仓库。**
