# 更新记录

本项目按版本记录每次交付的范围、变更点与验证结论。所有「验证」条目均为实际执行结果，未验证的内容会明确标注。

---

## v1.1.3 · 新增访客端渲染验证，修复「视频悬浮预览从不播放」

交付日期：2026-09-27

### 一、背景

本轮原本只是启动前后端服务，但补做**访客端渲染验证**时抓到一个此前从未被验证过的核心功能缺陷：
需求文档明确要求「视频封面 hover 静音预览」，而实际代码从未真正播放过视频。

### 二、修复的真实缺陷：视频悬浮预览从不播放

**现象**：hover 视频卡片时 `<video>` 元素正确挂载、`muted=true`，但 `paused=true`、`currentTime=0.00` —— 画面停在第一帧不动。

**根因**（`web-portal/src/components/BlogCard.vue`）：

```js
watch(videoSrc, async (src) => {
  const el = videoEl.value
  if (!el) return        // ← 永远从这里返回
  await el.play()
})
```

`watch` 默认是 **pre-flush**：回调在组件重新渲染**之前**执行。而 `<video>` 是 `v-if="videoSrc && ..."`
条件渲染的，第一次 hover 时那一刻 DOM 还没有 video 元素，`videoEl.value` 仍是 `null`，
于是 `if (!el) return` 直接跳出，`play()` 一次都没被调用。

**修复**：改用 `{ flush: 'post' }` 并 `await nextTick()`，等 DOM 更新完成、模板引用指向真实元素后再调用 `play()`。

**实测对比**：

| 断言 | 修复前 | 修复后 |
| --- | --- | --- |
| hover 后挂载 video 元素 | 挂载成功 | 挂载成功 |
| video 为静音 | `muted=true` | `muted=true` |
| **视频正在播放** | **`paused=true`，`currentTime=0.00`** | **`paused=false`，`currentTime=2.86`** |
| 移开后卸载 video | 通过 | 通过 |

### 三、新增访客端渲染验证 `scripts/verify-portal-ui.mjs`

与后台验证同规格（无头 Chrome + 真实鼠标事件），19 项断言：

| 分组 | 断言要点 |
| --- | --- |
| 首页列表 | 卡片数与接口一致、每张卡片有封面、**封面图全部真实加载**（`naturalWidth>0`，排除 404/白图）、**首页不预加载任何 `<video>`**（性能约束） |
| 多图轮播 | hover 时封面切换、移开后回到第一张（真实鼠标事件，非 JS 触发） |
| 视频预览 | hover 挂载 video、静音、**确实在播放**、移开后卸载并保留静态帧 |
| 详情页 | 卡片点击跳转、**标题与接口数据一致**、富文本正文渲染、无新增报错 |
| 404 | 访客端 404 页面渲染 |
| 控制台/网络 | 无控制台错误、无真实失败请求 |

根脚本新增 `pnpm verify:portal-ui`、`pnpm verify:article-edit`、`pnpm verify:all`（一键跑全部四套）。

### 四、验证脚本自身修掉的两处「假验证」

诚实记录：这两个问题出在验证脚本，不是产品代码，但都会掩盖真实缺陷。

1. **hover 坐标不可靠**：脚本原先用 `scrollIntoView()` + 立即读 `getBoundingClientRect()` 手算鼠标坐标。
   本站启用了 CSS `scroll-behavior: smooth`，滚动是异步的，读到的 rect 是滚动前的旧值，
   鼠标可能落在卡片之外 → 视频断言出现**假失败**。改用 Puppeteer 的 `ElementHandle.hover()`
   （内部先滚动到可视区域再移动到元素中心）。
2. **详情页标题取错元素（假通过）**：脚本原先取页面第一个 `<h1>`，而页头的站点名也是 `<h1>`，
   于是「标题非空」永远通过、实际根本没验证文章标题。已给文章标题加 `data-testid="article-title"`，
   断言改为「页面标题 === 接口返回标题」。

同时把 `net::ERR_ABORTED` 从「失败请求」中单独归类并打印明细：
它表示**浏览器主动取消**（多图轮播每 900ms 换 `src`、鼠标移开卸载 video 释放解码资源），
按定义不可能代表资源损坏（404/500/DNS 是别的错误码），因此不计为失败但如实展示。

### 五、趋势图柱高：0 值渲染语义

后台工作台「近 7 天登录趋势」在运行几天后会自然出现 0 登录的日期（种子数据的日志时间相对灌库时刻生成）。
此时柱高为 0 是**正确表现**，不是缺陷。据此做了两处调整：

- **产品侧**：新增 `barHeight(count)`，次数为 0 → 0 高度；次数非 0 → 按比例但**至少 2px**，
  避免某天次数远小于峰值时被四舍五入成 0，视觉上与「当天没有登录」无法区分。
- **验证侧**：断言改为**数据驱动** —— 解析柱子 `title` 里的次数，校验「0 次必须 0 高度、非 0 必须可见」，
  不再假设每天都有登录。

### 六、验证结果（本次实测）

```text
访客端渲染验证   scripts/verify-portal-ui.mjs              19/19
后台渲染验证     scripts/verify-admin-ui.mjs               30/30
文章编辑往返     scripts/verify-article-edit-roundtrip.mjs 10/10
后端接口冒烟     scripts/smoke.ps1                         28/28
                                                 合计      87 项全通过

web-portal 构建（vue-tsc + vite build）                    0 错误
```

### 七、仍未处理（需要你决定的遗留项）

访客端首页《久坐党的人体工学椅选购指南》的静态封面帧**接近全黑**（见 `scripts/artifacts/portal-01-home.png`）。
原因是「随机时间点抽帧」命中了视频淡入黑场。这是内容质量问题不是代码缺陷，**本次未改动**。
可选方案：抽帧时生成多张候选帧，按亮度/色彩丰富度择优（保留随机性），需要重跑一次 `pnpm backend:seed` 重新生成演示封面。

---

## v1.1.2 · 修复全局 Naive-UI Provider 丢失（`injection "n-config-provider" not found`）

交付日期：2026-05-20

### 一、现象（用户反馈）

后台「文章管理」页面控制台报：

```text
[Vue warn]: injection "n-config-provider" not found.
  at <DataTableBody … showHeader=false …>
  at <DataTable …>
  at <ArticleListView …>
```

### 二、根因

v1.1.0 把后台合并进 `web-portal` 时，`App.vue` 被覆盖成了**纯访客端版本**，
后台原有的整套全局 Provider 全部丢失：

```text
NConfigProvider → NGlobalStyle → NLoadingBarProvider → NDialogProvider
                → NNotificationProvider → NMessageProvider
```

后果不止是那条警告：

| 影响 | 表现 |
| --- | --- |
| `n-config-provider` 注入缺失 | DataTable 的滚动/空态表体分支拿不到配置，控制台报注入警告 |
| 主题覆写失效 | `themeOverrides` 未生成 CSS 变量，`DataTable.thFontWeight: '600'` 实际是 `500`、主色仍是 Naive 默认绿而非配置的蓝 |
| 语言环境失效 | `locale: zhCN` 未生效（下拉框显示 "Please Select" 而非中文） |
| 全局反馈组件缺失 | `NDialogProvider` / `NMessageProvider` / `NNotificationProvider` 不在树内，后台的弹窗与消息提示失去主题与语言上下文 |

### 三、定位过程（可复用的排查手法）

1. 先按用户堆栈尝试复现：菜单切换 ×80 次、硬刷新、多种视口、空表格筛选 —— 均无法复现警告，说明不是时序问题。
2. 转查依赖树：`createInjectionKey('n-config-provider')` 实际只返回字符串，因此只可能是「provide 端缺失」。
3. 断言主题是否生效：读取 `.n-data-table-th` 的 `computedStyle.fontWeight`，期望 `600` 实际拿到 `500` ——
   **这条断言把问题从「偶发警告」变成「稳定可测的配置失效」**，比追警告本身更有效。
4. 检查 `App.vue` 发现 Provider 全丢，补回后 `fontWeight=600`、`primaryColor=rgb(37,99,235)`、表格重新落在 provider 树内（depth=14）。

### 四、修复内容

- `web-portal/src/App.vue` 恢复完整 Provider 链，并保留访客端 / 后台的区域渲染分支。
- `NConfigProvider` 显式加 `class="n-config-provider"`：该组件需要这个类名才会挂载主题样式节点，否则 `themeOverrides` 不生成 CSS 变量。
- 主题偏好（明暗）统一由 `admin/stores/app` 提供，访客端与后台共用，避免两套主题源。

### 五、验证结果

| 断言 | 修复前 | 修复后 |
| --- | --- | --- |
| 表头字重（期望主题覆写 600） | 500 | **600** |
| 主色标签颜色（期望 #2563eb） | rgb(24,160,88) 默认绿 | **rgb(37,99,235)** |
| 表格是否在 provider 树内 | 否（depth=-1） | **是（depth=14）** |

回归（全部实测通过）：

```text
scripts/smoke.ps1                    后端接口冒烟            28/28
scripts/verify-admin-ui.mjs          后台渲染验证            29/29
scripts/verify-article-edit-roundtrip.mjs  文章编辑往返      10/10
访客端首页                           6 张卡片 / 6 张图加载 / 0 报错
pnpm --filter @sanmuzi/web-portal build                        0 错误
```

### 六、过程说明（诚实记录）

本轮排查中我曾尝试给每个表格包一层 `NConfigProvider` 的 `AdminDataTable` 封装来「保证注入」。
该方案**方向错误且引入了新回归**（表格不再渲染、筛选栏竖排），已完整回滚。
真正原因是根部 Provider 缺失，在根部修一处即可，不需要在四个页面各包一层。

---

## v1.1.1 · 修复富文本编辑器打开编辑页即报错

交付日期：2026-05-20

### 一、现象（用户反馈的真实控制台错误）

打开「文章管理 → 编辑」时控制台报：

```text
[Vue warn]: Unhandled error during execution of watcher callback  at <RichTextEditor …>
[Vue warn]: Unhandled error during execution of component update    at <ArticleEditView …>

TypeError: Cannot read properties of null (reading 'length')
    at previous → withoutNormalizing → insertFragment → editor.setHtml
    at <anonymous> (src/components/RichTextEditor.vue:68)
Error: Cannot resolve a DOM node from Slate node: {"text":""}
    at toDOMNode → toDOMPoint → toDOMRange
```

### 二、根因（三个叠加的 wangEditor 集成坑）

1. **不能用 `v-model` 绑定 Editor**。wangEditor 5 的 `Editor` 是非受控组件：`v-model` 会在内容变化后把同一个响应式变量再写回编辑器，触发内部 slate 选区归一化，抛出上述两个异常。
2. **`onCreated` 回调里立刻 `setHtml()` 不可靠**。此时 wangEditor 内部 state（含工具栏）尚未装配完成，setHtml 必然抛 `Cannot read properties of null (reading 'length')`。
3. **只给 Editor 换 `key` 重建而不重建 Toolbar**，会报 `Repeated create toolbar by selector '[object HTMLDivElement]'`。

### 三、修复方案

改为 wangEditor 官方支持的 **`default-html` + `key` 重建**，不再手动调用 `setHtml`：

- 编辑器首次挂载用 `default-html` 做初始渲染；
- 父级内容发生**外部替换**（打开编辑页异步回填）时递增 key，让 Editor 与 Toolbar 一起以新内容重建；
- 编辑器自身输入通过 `on-change` 回抛父级，此时父级值 === 编辑器值，不会触发重建（无回环）。

同时补充：未就绪期间不写入、空内容统一用 `<p><br></p>` 占位、组件卸载 `destroy()` 防止全局事件泄漏。

### 四、验证结果

新增 `scripts/verify-article-edit-roundtrip.mjs`（无头 Chrome 全链路往返）：

```text
[1] 编辑页正文已加载       正文 456 字符
[1] 正文标题层级保留       h2 数量=1
[1] 正文图片保留           img 数量=1
[1] 编辑器未报错（无 slate 异常）
[2] 修改标题并保存 → 保存后回到文章列表 → 标题已落库
[2] 正文未丢失（保存后仍有 h2 与图片）
[3] 标题还原为原始值
[3] 全流程无控制台错误

全部通过：10/10
```

回归：`verify-admin-ui.mjs` 29/29 通过、`web-portal` 构建 0 错误、控制台 0 报错。

### 五、遗留说明

- 编辑器往返会在正文中引入零宽空格字符（U+200B，wangEditor 处理 `<p><br></p>` 时产生）。它不影响渲染与阅读，但会让 `content` 字符数略增（实测 643 → 658）。若要求正文严格不含零宽字符，可在保存前做一次清洗，当前未处理。
- 视频型卡片的静态封面帧使用「随机时间点抽帧」，可能命中视频黑场（实测《久坐党的人体工学椅选购指南》封面偏黑）。这是内容质量问题不是缺陷，**未修改**；如需改善，方案是候选多帧按亮度/色彩择优。

---

## v1.1.0 · 后台合并为单应用 `/admin`，修复后台整页错位

交付日期：2026-05-20

### 一、用户反馈的两个问题

1. **后台 UI 错位**：顶栏内容竖排、账号信息挤进页签栏、趋势图被压成横条、登录表单撑满整屏。
2. **希望前后台同页**：要能直接访问 `http://localhost:5173/admin` 作为管理后台入口。

### 二、后台错位的根因（不是样式微调，是构建配置缺陷）

`web-admin/src/styles/main.css` **漏了 `@import 'tailwindcss'`**，且 Vite 未挂 `@tailwindcss/vite` 插件。后果：源码里所有 Tailwind 工具类（`flex` / `grid-cols-4` / `max-w-*` / `gap-*`）全部没有生成——产物 CSS 仅 0.44 kB。页面因此表现为「有内容但不对齐」。

修复过程中进一步发现：只写 `@import 'tailwindcss/utilities.css'` 也不够。v4 的 utilities 依赖默认主题变量（`--spacing` 等），跳过完整导入会导致 `gap-*`、`h-[Npx]`、`grid-cols-*` 这类**依赖主题刻度的工具类静默不生成**（实测 `flex` 生效、`gap-3` 完全缺失）。最终方案：导入完整 `tailwindcss`。

### 三、单应用双区域改造

| 项目 | 改造前 | 改造后 |
| --- | --- | --- |
| 访客端 | `web-portal`，端口 5173 | 同一应用，路径 `/` |
| 管理后台 | `web-admin` 独立应用，端口 5174 | 同一应用，路径 `/admin`（`web-admin` 已删除） |
| 构建产物 | 两份（两个 dist、两套 Nginx location） | 一份 `web-portal/dist` |
| 后台依赖 | 首屏必需 | 按需懒加载，访客端首屏不下载 |

具体做法：

- 后台源码迁入 `web-portal/src/admin/`（views / layout / stores / api / router / permission / utils / config），共用组件（`SvgIcon`、`ImageUploader`、`VideoUploader`、`RichTextEditor`）提升到 `web-portal/src/components/`。
- 后台路由统一加 `/admin` 前缀并使用绝对路径，路由 name 加 `admin-` 前缀；未匹配地址按前缀分别落到后台 404 与访客端 404。
- 后台守卫拆到 `src/admin/router/guard.ts`，只接管 `/admin/**`；401 处理只在后台区域内跳转，避免访客端公开接口返回 401 时被误跳。
- **按需加载**：`main.ts` 不再静态导入任何后台模块，改为 `import('@/admin/bootstrap')`，配合 history 拦截覆盖运行时导航。实测入口 chunk 95→170 kB，但 `index.html` **不再预加载** 890 kB 的 Naive-UI 与 812 kB 的编辑器包。

### 四、这一轮修掉的真实缺陷

| # | 缺陷 | 影响 | 处理 |
| --- | --- | --- | --- |
| 1 | 后台缺 `@import 'tailwindcss'`，Vite 未挂 Tailwind 插件 | 整页错位（顶栏竖排、表单撑满、图表压扁） | 补齐导入与插件，并注明「不能用 utilities 子集导入」的原因 |
| 2 | 迁移脚本把第三方包名当成本地别名改写（`@wangeditor/` → `@/admin/utils/wangeditor/`） | 构建报模块找不到 | 修正引用；迁移脚本的替换项加上 `from ` 前缀，避免子串误伤 |
| 3 | `@/admin/config` 自我循环导出（`export { API_BASE } from '@/admin/config'`） | TS2303 循环定义 | 改为从 `@/config` 导入后再导出 |
| 4 | 趋势图柱高算法不健壮（宽 0、高度被拉伸成横条） | 图表不可读 | 改为内联样式的 grid 布局 + 显式高度，并加 `data-testid` 供断言 |
| 5 | 登录表单在部分断点撑满整屏（依赖 `max-w-*` 工具类） | 登录页排版塌陷 | 改用固定 CSS 类 `.login-form-wrap`，不再依赖断点工具类 |
| 6 | **深链 / 硬刷新 `/admin/**` 时后台守卫从未执行** | 守卫没跑 → 不请求 `/api/auth/profile` → 顶栏显示「未登录」、菜单只剩 2 项 | `createWebHistory()` 在模块导入阶段就完成首次导航，早于守卫注册。改为 `await router.isReady()` 后显式补一次后台初始化与用户信息拉取，再 `mount` |
| 7 | 导航守卫里 `return to.fullPath` 触发无限重定向 | 页面白屏、路由中止 | 放弃用守卫做懒挂载，改为 history 层拦截 |
| 8 | 手工 `manualChunks` 把 Naive-UI 提升进首屏预加载 | 访客端白下 890 kB | 去掉手工分包，依赖动态 import 自然分包 |
| 9 | build 静默产出空 dist | `node dist/main.js` 报模块找不到 | 关闭 `incremental`（详见 v1.0.0 缺陷表 #2），本轮补充验证连续多次构建 |
| 10 | favicon 404 噪音 | 控制台报错、验证脚本误判 | 两个入口都加内联 SVG favicon |
| 11 | `.gitignore` 的 `!storage/uploads/.gitkeep` 无效（父目录被整体忽略） | 目录结构可能丢失 | 改为忽略 `uploads/` 并保留显式跟踪的 `.gitkeep` |

### 五、新增的验证能力（可复用）

| 文件 | 作用 |
| --- | --- |
| `scripts/verify-admin-ui.mjs` | 无头 Chrome（puppeteer-core，自动探测本机 Chrome/Edge）真实渲染后台：真实表单登录 → 断言布局不错位、主题生效、图表正常、接口数据落地、硬刷新后登录态恢复 → 收集控制台报错与失败请求 → 输出各页截图 |
| `scripts/migrate-admin-to-portal.mjs` | 一次性迁移脚本（已执行，保留作追溯） |
| `backend-nest/scripts/flush-cache.ts` | 清空本站 Redis 缓存键，改站点配置后让前台立即生效 |

`pnpm verify:admin-ui` 与 `pnpm smoke` 已加入根 `package.json` 脚本。

### 六、验证结果

```text
后端接口冒烟        scripts/smoke.ps1      → 全部通过 28/28
后台 UI 渲染验证    verify-admin-ui.mjs    → 全部通过 29/29
全量构建            pnpm build             → 3 个包全部 Done，0 错误
```

`verify-admin-ui` 关键断言（对应上表缺陷）：

| 断言 | 实测 |
| --- | --- |
| 登录表单宽度受控 | form=380px / viewport=1600px |
| 顶栏不与侧边栏重叠 | header.left=220 = sider.right=220 |
| 卡片背景色生效（主题已注入） | rgb(255, 255, 255) |
| 页签栏横向单行 | height=38，text="工作台" |
| 趋势图 7 列、高度固定、柱子可见 | 190px 高、14 根柱子、柱宽 96–97px、横向跨度 639px |
| 页面无横向溢出 | scrollWidth=1600 = viewport |
| **硬刷新后恢复用户信息** | 顶栏="…超级管理员…"（修复前是「未登录」） |
| **硬刷新后菜单按权限完整** | 工作台 / 内容运营 / 系统管理 / 修改密码 |
| 各功能页无控制台报错 | 6 个页面逐一通过 |

### 七、未覆盖项（延续 v1.0.0 的诚实声明）

- MinIO 驱动、Docker 构建、`change-password` 端到端仍未实测（原因同 v1.0.0）。
- 富文本编辑器与多图拖拽排序在真实浏览器中的**人工交互**未逐项操作，仅通过渲染层验证（编辑器容器与页面无报错）。
- 本轮验证在 1600×1000 视口下进行；移动端/窄屏布局未做逐断点人工复核。

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
