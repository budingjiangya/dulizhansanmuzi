# 三目子 · 产品推荐博客站点

前台内容门户 + RBAC 后台管理系统。前后端统一 TypeScript 技术栈，三端共享同一份接口契约。

```text
dulizhan/
├── contracts/      三端共享契约：统一响应包装、权限码、领域模型（唯一事实来源）
├── backend-nest/   NestJS 11 + Prisma 6 + MySQL 8.4 + Redis + FFmpeg
├── web-portal/     前台门户 Vue 3.5 + Vite 6 + TailwindCSS v4（访客端）
├── web-admin/      管理后台 Vue 3.5 + Vite 6 + Naive-UI 2.40（运营端）
└── docs/           接口文档、部署说明、更新记录
```

## 一、技术栈

| 端 | 关键技术 | 版本 |
| --- | --- | --- |
| 前台门户 | Vue / Vite / TypeScript / TailwindCSS / Vue-Router / Pinia / Axios | 3.5.43 · 6.3.5 · 5.7.3 · 4.1.14 · 4.5.1 · 2.3.1 · 1.20 |
| 管理后台 | Vue / Vite / TypeScript / Naive-UI / WangEditor 5 / dayjs | 3.5.43 · 6.3.5 · 5.7.3 · 2.40.4 · 5.1.23 · 1.11.18 |
| 后端服务 | NestJS / Prisma / MySQL / Redis / JWT / bcrypt / FFmpeg / MinIO SDK / Swagger | 11.1.6 · 6.19.0 · 8.4 · 7.x · 11.x · 3.0 · 6.x · 8.0 · 11.2 |

## 二、环境要求

- Node.js >= 20.11（实测 22.23.2）
- pnpm >= 9（实测 12.5.1）
- MySQL 8.x（已配置外部实例 `110.42.32.92:3306/dulizhan`）
- Redis（已配置外部实例 `110.42.32.92:6379`）
- FFmpeg / FFprobe（视频时长探测与随机抽帧，Windows 下可用 winget 安装 `Gyan.FFmpeg`）

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

# 4. 分别启动两个前端
pnpm portal:dev     # 前台 http://localhost:5173
pnpm admin:dev      # 后台 http://localhost:5174
```

演示账号（由 seed 脚本写入）：

| 账号 | 密码 | 角色 | 可访问范围 |
| --- | --- | --- | --- |
| `admin` | `Admin@123456` | 超级管理员 | 全部功能：文章、账号、角色、登录日志 |
| `editor` | `Editor@123456` | 内容编辑 | 仅文章增删改查与资源上传；账号/日志接口会被后端 403 拒绝 |

## 四、常用脚本

| 命令 | 说明 |
| --- | --- |
| `pnpm dev` | 并行启动后端 + 前台 + 后台 |
| `pnpm build` | 递归构建三端产物 |
| `pnpm typecheck` | 递归执行三端类型检查 |
| `pnpm backend:prisma:migrate` | 生成并应用数据库迁移 |
| `pnpm backend:prisma:push` | 不生成迁移文件，直接同步表结构（开发期快速迭代） |
| `pnpm backend:seed` | 重置并灌入演示数据（幂等，会清空业务表） |
| `pnpm --filter @sanmuzi/backend cache:flush` | 清空本站 Redis 缓存键（改配置后让前台立即生效） |
| `pnpm portal:build` / `pnpm admin:build` | 单独构建某一端 |

## 五、核心实现要点

### 5.1 RBAC 权限

- JWT 载荷**只放 `userId` 与 `roleId`**，不存权限数组；`PermissionsGuard` 每次请求实时查库读取角色权限，权限回收后旧 Token 立即失效。
- 前端只做菜单与按钮显隐（`v-permission` 指令 + 菜单按权限码过滤），**接口层由后端守卫二次鉴权**，绕过前端直接调接口同样会被拒绝。
- 角色固定两类：超级管理员（全部权限）、内容编辑（仅文章相关权限）；权限码定义在 `contracts/src/enums.ts`，前后端引用同一份常量。

### 5.2 视频上传与随机抽帧

1. 视频上传（小文件直传 / 大文件分片，分片会话存 Redis，支持断点续传与秒传）。
2. `ffprobe` 读取总时长与分辨率。
3. 在 `0 ~ (totalDuration - 1)` 秒区间随机取时间点。
4. `ffmpeg` 执行抽帧，产出 jpg 静态封面帧并写入 `coverVideoFrame`。
5. 后台编辑页支持指定时间点重新抽帧。

### 5.3 前台卡片交互（性能优先）

- **多图模式**：默认渲染第一张封面；`mouseenter` 起定时器逐张轮切，`mouseleave` 立即停止并回到第一张。
- **视频模式**：默认只渲染后端抽帧的静态图；`mouseenter` 才绑定视频源并以 `muted + autoplay` 静音播放，`mouseleave` 立刻暂停并卸载 `src` 释放解码资源——**首页不预加载任何视频**。
- 列表卡片图片 `loading="lazy"`，首屏前两张 `fetchpriority="high"`。

### 5.4 登录日志与密码

- 登录成功与失败都写入 `admin_login_log`（记录 IP、时间、结果）；仅超级管理员可分页查询并支持时间区间筛选。
- 登录失败次数通过 Redis 限流（窗口内超过阈值锁定）。
- 管理员密码用 bcrypt 哈希存储；超管可重置他人密码，个人可自助改密。

## 六、文档

- [接口文档](docs/API.md)
- [部署说明](docs/DEPLOYMENT.md)
- [更新记录](docs/UPDATE_LOG.md)

## 七、安全提示

`backend-nest/.env` 内含当前演示环境的数据库与 Redis 明文口令，为便于本机直接启动而纳入版本管理。**正式上线前必须轮换为随机强口令，并改用环境变量或密钥管理服务注入，不要提交到仓库。**
