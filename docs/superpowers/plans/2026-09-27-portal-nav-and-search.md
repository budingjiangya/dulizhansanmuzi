# 前台导航扩展与站内搜索 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在访客端头部新增「关于本站 / 分类 / 搜索框 / 邮件订阅」四个入口，并让站内搜索真实可用（覆盖全部已上架文章的标题、摘要与正文）。

**Architecture:** 只动 `web-portal`（前端）与 `contracts`（共享契约），后端在 `portal` 模块新增一个公开查询端点。搜索不复用首页列表端点：首页语义固定为「推荐位」，搜索语义固定为「全部已上架」，两者独立可测。搜索不建新表、不做数据库迁移、不做 Redis 缓存。

**Tech Stack:** NestJS 11 + Prisma 6 + class-validator（后端）；Vue 3.5 + Vite 6 + TailwindCSS v4 + Vue-Router 4（前端）；验证用 PowerShell 冒烟脚本与 Puppeteer 无头 Chrome 渲染脚本。

**Spec:** `docs/superpowers/specs/2026-09-27-portal-nav-and-search-design.md`

## Global Constraints

- 本仓库**没有单元测试框架**。每个任务的「测试」是既有的两套验证设施：`scripts/smoke.ps1`（接口级）与 `scripts/*-ui.mjs`（无头 Chrome 渲染级）。不要引入 jest/vitest。
- 后端类型检查必须 `pnpm --filter @sanmuzi/backend typecheck` 为 0 错误；前端必须 `pnpm --filter @sanmuzi/web-portal build` 为 0 错误（该命令内含 `vue-tsc`）。
- 所有源码文件为 UTF-8（无 BOM）。`scripts/smoke.ps1` 例外，**必须保持 UTF-8 带 BOM**，否则 Windows PowerShell 5.1 会按 ANSI 读取导致解析失败。
- 全中文注释与中文 Swagger description；业务逻辑写在 service，不写在 controller。
- 统一响应包 `{ code, message, data, timestamp }`；分页 `{ list, total, page, pageSize, totalPages }`。
- 错误码：参数校验 `40000`、未登录 `40100`、无权限 `40300`、不存在 `40400`。
- 搜索关键词上限 50 字，前端 `maxlength` 与后端校验必须一致。
- 导航项来自后端 `site-config`，有 24 小时 Redis 缓存；改动后必须执行 `pnpm backend:cache:flush`。
- 视觉取向：只用留白、字号层级与一条细分隔线；不引入卡片边框、阴影或按钮底色。
- 后端进程运行方式：`cd backend-nest && node dist/main.js`（改动后端代码后必须重新 `pnpm --filter @sanmuzi/backend build` 并重启）。

## 关键风险（实现时必须遵守）

**NestJS 路由声明顺序**：`PortalController` 已有 `@Get('articles/:id')`。`:id` 会匹配任意字符串段，因此 `@Get('articles/search')` **必须声明在 `articles/:id` 之前**，否则请求 `/api/portal/articles/search` 会落到详情路由，`ParseIntPipe` 解析 `"search"` 失败返回 400。计划中所有涉及该 controller 的步骤都已按此顺序给出，不要调整。

## 文件结构

| 类型 | 文件 | 职责 |
| --- | --- | --- |
| 改 | `contracts/src/domain.ts` | 新增 `PortalSearchQuery` 契约 |
| 增 | `backend-nest/src/modules/portal/dto/search-portal-article.dto.ts` | 搜索入参校验（关键词 1–50 字 + 分页） |
| 改 | `backend-nest/src/modules/portal/portal.controller.ts` | 新增公开搜索路由（**在 `articles/:id` 之前**） |
| 改 | `backend-nest/src/modules/portal/portal.service.ts` | `searchArticles()`；`nav` 扩展为 5 项 |
| 改 | `backend-nest/src/modules/blog/blog.service.ts` | `searchPortalArticles()`；`findPortalArticleDetail()` 可见性对齐 |
| 增 | `web-portal/src/components/HeaderSearch.vue` | 搜索输入框（只收集关键词并提交，不持有结果状态） |
| 改 | `web-portal/src/components/SiteHeader.vue` | 接入搜索框，桌面单行 / 窄屏换行 |
| 增 | `web-portal/src/views/SearchView.vue` | 搜索结果页（以 URL 的 `q` 为唯一数据源） |
| 增 | `web-portal/src/views/AboutView.vue` | 关于本站（静态内容） |
| 增 | `web-portal/src/views/ComingSoonView.vue` | 「即将上线」占位页，被 `/category` 与 `/subscribe` 复用 |
| 改 | `web-portal/src/router/index.ts` | 新增 4 条访客端路由 |
| 改 | `web-portal/src/api/article.ts` | 新增 `fetchPortalSearch()` |
| 改 | `scripts/smoke.ps1` | 搜索端点 + 可见性对齐断言 |
| 增 | `scripts/verify-search-ui.mjs` | 头部、搜索页、关于页、占位页渲染断言 |

---

### Task 1: 契约层新增搜索入参类型

**Files:**
- Modify: `contracts/src/domain.ts`（在 `ArticleQuery` 定义之后追加）
- Test: `pnpm --filter @sanmuzi/contracts typecheck`

**Interfaces:**
- Consumes: 已有的 `PageQuery`（来自 `contracts/src/core.ts`）
- Produces: `PortalSearchQuery` —— 后端 DTO 实现它，前端 API 层使用它

- [ ] **Step 1: 在 `contracts/src/domain.ts` 的 `ArticleQuery` 之后插入新类型**

```ts
/** 前台站内搜索入参（公开接口，覆盖全部已上架文章） */
export interface PortalSearchQuery extends PageQuery {
  /** 搜索关键词，必填；匹配标题、摘要与富文本正文 */
  keyword: string
}
```

- [ ] **Step 2: 运行类型检查，确认 0 错误**

Run: `pnpm --filter @sanmuzi/contracts typecheck`
Expected: 无输出、退出码 0

- [ ] **Step 3: 提交**

```bash
git add contracts/src/domain.ts
git commit -m "feat(contracts): 新增前台站内搜索入参类型 PortalSearchQuery"
```

---

### Task 2: 后端搜索端点 + 详情可见性对齐

**Files:**
- Create: `backend-nest/src/modules/portal/dto/search-portal-article.dto.ts`
- Modify: `backend-nest/src/modules/portal/portal.controller.ts`
- Modify: `backend-nest/src/modules/portal/portal.service.ts`
- Modify: `backend-nest/src/modules/blog/blog.service.ts`
- Test: `scripts/smoke.ps1`（本任务新增断言）

**Interfaces:**
- Consumes: `PortalSearchQuery`（Task 1）、`BlogService.searchPortalArticles()`、`normalizePaging()`、`buildPageResult()`、`LIST_SELECT`
- Produces:
  - `GET /api/portal/articles/search?keyword=&page=&pageSize=` → `PageResult<ArticleListItemVo>`
  - `BlogService.searchPortalArticles(keyword: string, page: number, pageSize: number): Promise<{ list: ArticleListItemVo[]; total: number }>`
  - `PortalService.searchArticles(query: SearchPortalArticleDto): Promise<PageResult<ArticleListItemVo>>`

- [ ] **Step 1: 先写失败的断言（追加到 `scripts/smoke.ps1`）**

在 `# ---------------------------------------------------------------- 5. 管理功能` 这一行**之前**插入新的测试分组：

```powershell
# ---------------------------------------------------------------- 4.5 站内搜索
Write-Host ''
Write-Host '[4.5] 站内搜索与可见性对齐' -ForegroundColor Yellow

Test-Case '搜索命中：标题/摘要/正文均可匹配' {
  $res = Invoke-Api -Method GET -Path '/api/portal/articles/search?keyword=%E6%98%BE%E7%A4%BA%E5%99%A8&page=1&pageSize=9'
  Assert-Equal $res.code 0 '业务码应为 0'
  Assert-True ($res.data.total -ge 1) '关键词「显示器」应至少命中 1 篇演示文章'
  Assert-True (@($res.data.list).Count -ge 1) 'list 不能为空'
  "命中 $($res.data.total) 篇，首篇 = 「$(@($res.data.list)[0].title)」"
}

Test-Case '搜索结果不含富文本正文' {
  $res = Invoke-Api -Method GET -Path '/api/portal/articles/search?keyword=%E6%98%BE%E7%A4%BA%E5%99%A8'
  Assert-Equal $res.code 0 '业务码应为 0'
  Assert-True (@($res.data.list).Count -ge 1) 'list 不能为空（否则下面的字段断言无意义）'
  $first = @($res.data.list)[0]
  Assert-True (-not ($first.PSObject.Properties.Name -contains 'content')) '搜索结果不应返回正文 content'
  "字段数 = $(@($first.PSObject.Properties.Name).Count)"
}

Test-Case '搜索无命中返回空列表而不是错误' {
  $res = Invoke-Api -Method GET -Path '/api/portal/articles/search?keyword=zzz-no-such-article-zzz'
  Assert-Equal $res.code 0 '业务码应为 0（无命中不是错误）'
  Assert-True ($null -ne $res.data) '应返回 data 段'
  Assert-Equal $res.data.total 0 '不应命中任何文章'
  Assert-Equal @($res.data.list).Count 0 'list 应为空数组'
}

Test-Case '搜索关键词为空返回 40000' {
  $res = Invoke-Api -Method GET -Path '/api/portal/articles/search?keyword='
  Assert-Equal $res.__body.code 40000 '应返回参数校验错误 40000'
  # 断言消息确实来自关键词校验，而不是路由冲突：
  # 若 articles/:id 吞掉了 search，ParseIntPipe 的消息是
  # "Validation failed (numeric string is expected)"，不含「关键词」
  Assert-True ($res.__body.message -like '*关键词*') "错误消息应来自关键词校验，实际 = $($res.__body.message)"
}

Test-Case '搜索关键词全空格返回 40000' {
  $res = Invoke-Api -Method GET -Path '/api/portal/articles/search?keyword=%20%20%20'
  Assert-Equal $res.__body.code 40000 'trim 后为空应返回 40000'
  Assert-True ($res.__body.message -like '*关键词*') "错误消息应来自关键词校验，实际 = $($res.__body.message)"
}

Test-Case '可见性对齐：已上架未推荐文章可搜索、可打开、但不进首页' {
  $created = Invoke-Api -Method POST -Path '/api/admin/articles' -Token $script:adminToken -Body @{
    title       = '可见性对齐测试文章（可安全删除）'
    shortDesc   = '用于验证「上架即可见、推荐位只管首页展示」的规则。'
    coverType   = 'image'
    coverImages = @('https://picsum.photos/seed/visibility/1200/800')
    content     = '<p>可见性对齐测试正文关键字：可见性对齐样本</p>'
    isRecommend = $false
    isPublish   = $true
    sort        = 0
  }
  Assert-Equal $created.code 0 '创建测试文章失败'
  $id = $created.data.id

  try {
    # 注意：变量名不能用 $home —— PowerShell 的 $HOME 是只读自动变量，赋值会直接报错
    $homeList = Invoke-Api -Method GET -Path '/api/portal/articles?page=1&pageSize=50'
    $inHome = @($homeList.data.list) | Where-Object { $_.id -eq $id }
    Assert-True ($null -eq $inHome) '未推荐文章不应出现在首页列表'

    $search = Invoke-Api -Method GET -Path '/api/portal/articles/search?keyword=%E5%8F%AF%E8%A7%81%E6%80%A7%E5%AF%B9%E9%BD%90%E6%A0%B7%E6%9C%AC'
    $inSearch = @($search.data.list) | Where-Object { $_.id -eq $id }
    Assert-True ($null -ne $inSearch) '已上架文章应能被搜索命中（含正文匹配）'

    $detail = Invoke-Api -Method GET -Path "/api/portal/articles/$id"
    Assert-Equal $detail.code 0 '已上架未推荐文章详情应可打开（可见性对齐）'

    $offline = Invoke-Api -Method PATCH -Path "/api/admin/articles/$id/publish" -Token $script:adminToken -Body @{ value = $false }
    Assert-Equal $offline.code 0 '下架失败'

    $searchAfterOffline = Invoke-Api -Method GET -Path '/api/portal/articles/search?keyword=%E5%8F%AF%E8%A7%81%E6%80%A7%E5%AF%B9%E9%BD%90%E6%A0%B7%E6%9C%AC'
    $stillThere = @($searchAfterOffline.data.list) | Where-Object { $_.id -eq $id }
    Assert-True ($null -eq $stillThere) '下架后不应再被搜索命中'

    $detailOffline = Invoke-Api -Method GET -Path "/api/portal/articles/$id"
    Assert-Equal $detailOffline.__body.code 40400 '下架后详情应返回 40400'
    "测试文章 ID = $id（未推荐可搜索、下架后不可见）"
  } finally {
    [void](Invoke-Api -Method DELETE -Path "/api/admin/articles/$id" -Token $script:adminToken)
  }
}
```

- [ ] **Step 2: 运行断言，确认失败**

先确认后端在运行（`node dist/main.js`），然后：

Run: `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\smoke.ps1`
Expected: 新增 6 项**全部 FAIL**。因为此时 `articles/search` 路由还不存在，请求会落到 `articles/:id`，
`ParseIntPipe` 解析 `"search"` 失败返回 `40000` 与 "Validation failed (numeric string is expected)"。
注意：若断言只检查「业务码为 40000」或「不含 content」，这种情况下会**假通过** ——
所以上面的断言额外加了 `code = 0` 前置检查与「错误消息含『关键词』」检查来区分二者。

- [ ] **Step 3: 新建搜索 DTO**

`backend-nest/src/modules/portal/dto/search-portal-article.dto.ts`：

```ts
/**
 * 前台站内搜索入参
 * keyword 必填：trim 后长度 1–50，为空或超限由 ValidationPipe 抛 BadRequest，
 * 经全局异常过滤器映射为业务码 40000。
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Transform } from 'class-transformer'
import { IsInt, IsNotEmpty, IsOptional, IsString, MaxLength, Min } from 'class-validator'
import { PAGE_DEFAULTS, type PortalSearchQuery } from '@sanmuzi/contracts'

/** 关键词最大长度（前端 maxlength 必须与此一致） */
export const SEARCH_KEYWORD_MAX_LENGTH = 50

const toOptionalInt = ({ value }: { value: unknown }): number | undefined => {
  if (value === undefined || value === null || value === '') return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.trunc(parsed) : (value as number)
}

export class SearchPortalArticleDto implements PortalSearchQuery {
  @ApiProperty({
    description: '搜索关键词，匹配标题、摘要与富文本正文',
    example: '显示器',
    maxLength: SEARCH_KEYWORD_MAX_LENGTH,
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString({ message: '关键词必须是字符串' })
  @IsNotEmpty({ message: '请输入搜索关键词' })
  @MaxLength(SEARCH_KEYWORD_MAX_LENGTH, { message: `关键词不能超过 ${SEARCH_KEYWORD_MAX_LENGTH} 个字符` })
  keyword!: string

  @ApiPropertyOptional({ description: '页码，从 1 开始', example: PAGE_DEFAULTS.page, default: PAGE_DEFAULTS.page })
  @IsOptional()
  @Transform(toOptionalInt)
  @IsInt({ message: '页码必须是整数' })
  @Min(1, { message: '页码最小为 1' })
  page?: number

  @ApiPropertyOptional({ description: '每页条数，最大 100', example: 9, default: PAGE_DEFAULTS.pageSize })
  @IsOptional()
  @Transform(toOptionalInt)
  @IsInt({ message: '每页条数必须是整数' })
  @Min(1, { message: '每页条数最小为 1' })
  pageSize?: number
}
```

- [ ] **Step 4: 在 `blog.service.ts` 新增搜索查询，并对齐详情可见性**

在 `findPortalArticles()` 之后插入搜索方法：

```ts
  /**
   * 前台站内搜索：匹配标题、摘要与正文，覆盖全部已上架文章
   *
   * 注意：正文使用 LIKE '%kw%' 匹配，无法使用索引。当前内容量下无性能问题；
   * 内容规模上来后应改用 MySQL 全文索引（FULLTEXT + MATCH ... AGAINST）或外部搜索引擎。
   * 排序按编辑权重 sort desc、更新时间 updatedAt desc，未做相关性打分。
   */
  async searchPortalArticles(
    keyword: string,
    page: number,
    pageSize: number,
  ): Promise<{ list: ArticleListItemVo[]; total: number }> {
    const { skip, take } = normalizePaging(page, pageSize)
    const where = {
      isPublish: true,
      OR: [
        { title: { contains: keyword } },
        { shortDesc: { contains: keyword } },
        { content: { contains: keyword } },
      ],
    }

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.blogArticle.count({ where }),
      this.prisma.blogArticle.findMany({
        where,
        skip,
        take,
        orderBy: [{ sort: 'desc' }, { updatedAt: 'desc' }],
        select: LIST_SELECT,
      }),
    ])

    return { list: rows.map((row) => this.toListItem(row)), total }
  }
```

把 `findPortalArticleDetail()` 整体替换为：

```ts
  /**
   * 前台文章详情：未上架按 40400 处理
   *
   * 可见性规则：isPublish 决定「能否被访问」，isRecommend 只决定「是否出现在首页推荐位」。
   * 推荐位是展示位置，不应兼任访问权限 —— 否则「已上架但未推荐」的文章会被搜索命中却打不开。
   */
  async findPortalArticleDetail(id: number): Promise<ArticleDetailVo> {
    const row = await this.prisma.blogArticle.findUnique({ where: { id } })
    if (!row || !row.isPublish) {
      throw BizException.notFound('文章不存在或已下架')
    }
    return this.toDetail(row)
  }
```

- [ ] **Step 5: 在 `portal.service.ts` 新增 `searchArticles()` 并扩展 `nav`**

在 `getArticleDetail()` 之前插入：

```ts
  /**
   * 站内搜索
   * 与首页列表不同，这里覆盖全部已上架文章，且不做 Redis 缓存 ——
   * 每个不同关键词都会产生一个缓存键，命中率极低且会污染缓存空间。
   */
  async searchArticles(query: SearchPortalArticleDto): Promise<PageResult<ArticleListItemVo>> {
    const { page, pageSize } = normalizePaging(query.page, query.pageSize)
    const keyword = query.keyword.trim()
    const { list, total } = await this.blogService.searchPortalArticles(keyword, page, pageSize)
    return buildPageResult(list, total, page, pageSize)
  }
```

补充 import：

```ts
import type { SearchPortalArticleDto } from './dto/search-portal-article.dto'
```

把 `getSiteConfig()` 里的 `nav` 替换为五项：

```ts
      nav: [
        { label: '首页', path: '/' },
        { label: '全部推荐', path: '/#recommendations' },
        { label: '分类', path: '/category' },
        { label: '关于本站', path: '/about' },
        { label: '邮件订阅', path: '/subscribe' },
      ],
```

- [ ] **Step 6: 在 `portal.controller.ts` 新增搜索路由**

**必须插在 `@Get('articles/:id')` 方法之前**（原因见「关键风险」）。同时补 import：

```ts
import { SearchPortalArticleDto } from './dto/search-portal-article.dto'
```

插入：

```ts
  @Public()
  @Get('articles/search')
  @ApiOperation({
    summary: '站内搜索',
    description:
      '按关键词搜索全部已上架文章，匹配标题、摘要与正文，按 sort desc, updatedAt desc 排序；结果不含 content。' +
      '关键词为空或超过 50 字返回 40000。注意：本路由必须声明在 articles/:id 之前，否则会被 :id 参数路由吞掉。',
  })
  @ApiOkResponse({ description: 'PageResult<ArticleListItemVo>' })
  async search(@Query() query: SearchPortalArticleDto): Promise<PageResult<ArticleListItemVo>> {
    return this.portalService.searchArticles(query)
  }
```

- [ ] **Step 7: 构建并重启后端**

```bash
pnpm --filter @sanmuzi/backend typecheck
pnpm --filter @sanmuzi/backend build
```

然后重启后端进程（先结束占用 3000 端口的进程，再 `cd backend-nest && node dist/main.js`）。
Expected: `typecheck` 0 错误；构建产出 `backend-nest/dist/main.js`

- [ ] **Step 8: 清缓存并运行断言，确认全部通过**

```bash
pnpm backend:cache:flush
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\smoke.ps1
```

Expected: 新增 6 项全部 PASS，且原有断言无回归（总数应为 34 项全通过）

- [ ] **Step 9: 提交**

```bash
git add backend-nest/src contracts/src scripts/smoke.ps1
git commit -m "feat(portal): 新增站内搜索端点，详情可见性对齐为「上架即可见」"
```

---

### Task 3: 头部导航与搜索框

**Files:**
- Create: `web-portal/src/components/HeaderSearch.vue`
- Modify: `web-portal/src/components/SiteHeader.vue`
- Create: `scripts/verify-search-ui.mjs`（本任务先建骨架，只含导航与搜索框断言）
- Test: `scripts/verify-search-ui.mjs`

**Interfaces:**
- Consumes: `useSiteConfigStore().config.nav`（后端下发的 5 项导航）
- Produces: `HeaderSearch.vue` 组件，props `{ maxLength?: number; initialValue?: string }`，提交时 `router.push({ name: 'search', query: { q } })`

- [ ] **Step 1: 先建失败的验证脚本**

新建 `scripts/verify-search-ui.mjs`：

```js
/**
 * 前台导航与站内搜索 UI 验证（无头 Chrome + Puppeteer）
 *
 * 用法：node scripts/verify-search-ui.mjs [--url=http://localhost:5173] [--out=scripts/artifacts]
 */
import { existsSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import puppeteer from 'puppeteer-core'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const rootDir = resolve(scriptDir, '..')

const args = process.argv.slice(2)
const readArg = (name, fallback) => {
  const hit = args.find((item) => item.startsWith(`--${name}=`))
  return hit ? hit.slice(name.length + 3) : fallback
}

const BASE_URL = readArg('url', 'http://localhost:5173').replace(/\/+$/, '')
const OUT_DIR = resolve(rootDir, readArg('out', 'scripts/artifacts'))

const CHROME_CANDIDATES = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  process.env.LOCALAPPDATA ? `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe` : '',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
].filter(Boolean)

const chromePath = CHROME_CANDIDATES.find((item) => existsSync(item))
if (!chromePath) {
  console.error('未找到 Chrome/Edge 可执行文件')
  process.exit(1)
}

mkdirSync(OUT_DIR, { recursive: true })

const results = []
const consoleErrors = []
const failedRequests = []

function check(name, passed, detail) {
  results.push({ name, passed, detail })
  console.log(`  [${passed ? 'PASS' : 'FAIL'}] ${name}${detail ? ` — ${detail}` : ''}`)
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const browser = await puppeteer.launch({
  executablePath: chromePath,
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--window-size=1600,1000'],
  defaultViewport: { width: 1600, height: 1000 },
})

try {
  const page = await browser.newPage()
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text().slice(0, 220))
  })
  page.on('pageerror', (error) => consoleErrors.push(`pageerror: ${error.message.slice(0, 220)}`))
  page.on('requestfailed', (request) => {
    failedRequests.push(`${request.method()} ${request.url()} — ${request.failure()?.errorText ?? 'unknown'}`)
  })
  page.on('response', (response) => {
    if (response.status() >= 400) {
      failedRequests.push(`${response.request().method()} ${response.url()} — HTTP ${response.status()}`)
    }
  })

  console.log('')
  console.log('============================================================')
  console.log(` 前台导航与站内搜索 UI 验证  base=${BASE_URL}`)
  console.log('============================================================')

  console.log('')
  console.log('[1] 头部导航与搜索框')
  await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle2', timeout: 60000 })
  await page.waitForSelector('[data-testid="blog-card"]', { timeout: 30000 })
  await sleep(1200)
  await page.screenshot({ path: resolve(OUT_DIR, 'search-01-header.png') })

  const EXPECTED_NAV = ['首页', '全部推荐', '分类', '关于本站', '邮件订阅']

  const header = await page.evaluate(() => {
    const nav = document.querySelector('[data-testid="site-nav"]')
    const links = nav ? Array.from(nav.querySelectorAll('a')) : []
    const searchForm = document.querySelector('[data-testid="header-search"]')
    const input = document.querySelector('[data-testid="header-search-input"]')
    return {
      navExists: Boolean(nav),
      labels: links.map((a) => (a.textContent ?? '').trim()),
      hrefs: links.map((a) => a.getAttribute('href') ?? ''),
      searchExists: Boolean(searchForm),
      inputExists: Boolean(input),
      inputMaxLength: input?.getAttribute('maxlength') ?? null,
    }
  })

  check('导航容器已渲染', header.navExists)
  check(
    '五个导航入口齐全且顺序正确',
    EXPECTED_NAV.every((label, index) => header.labels[index] === label) && header.labels.length === EXPECTED_NAV.length,
    `实际=${header.labels.join(' / ')}`,
  )
  check(
    '分类/关于本站/邮件订阅 指向正确路径',
    ['/category', '/about', '/subscribe'].every((path) => header.hrefs.includes(path)),
    `hrefs=${header.hrefs.join(' / ')}`,
  )
  check('搜索框已渲染', header.searchExists && header.inputExists)
  check('搜索框 maxlength 为 50（与后端校验一致）', header.inputMaxLength === '50', `maxlength=${header.inputMaxLength}`)

  console.log('')
  console.log('[2] 搜索框交互')
  const EMPTY_BEFORE = await page.evaluate(() => location.pathname)
  await page.click('[data-testid="header-search-input"]')
  await page.keyboard.press('Enter')
  await sleep(800)
  const afterEmptySubmit = await page.evaluate(() => location.pathname)
  check('空关键词提交不跳转', afterEmptySubmit === EMPTY_BEFORE, `path=${afterEmptySubmit}`)

  await page.type('[data-testid="header-search-input"]', '显示器')
  await Promise.all([
    page.waitForFunction(() => location.pathname === '/search', { timeout: 20000 }).catch(() => {}),
    page.keyboard.press('Enter'),
  ])
  await sleep(2000)
  const afterSubmit = await page.evaluate(() => ({ path: location.pathname, search: location.search }))
  check('输入关键词回车跳转到搜索页', afterSubmit.path === '/search', `path=${afterSubmit.path}`)
  check('URL 携带关键词查询参数', decodeURIComponent(afterSubmit.search).includes('q=显示器'), `search=${decodeURIComponent(afterSubmit.search)}`)

  console.log('')
  console.log('[3] 控制台与网络')
  const realErrors = consoleErrors.filter((text) => !text.includes('favicon'))
  const intentionalAborts = failedRequests.filter((item) => item.includes('ERR_ABORTED'))
  const realFailed = failedRequests.filter((item) => !item.includes('ERR_ABORTED') && !item.includes('favicon'))
  check('无控制台错误', realErrors.length === 0, realErrors.slice(0, 3).join(' | '))
  check('无失败请求（排除 favicon）', realFailed.length === 0, realFailed.slice(0, 3).join(' | '))
  if (intentionalAborts.length) {
    console.log(`        说明：${intentionalAborts.length} 个请求被主动中止（轮播切换封面 / 视频卸载释放解码资源），属预期行为`)
  }
} finally {
  await browser.close()
}

const failed = results.filter((item) => !item.passed)
console.log('')
console.log('============================================================')
console.log(
  failed.length === 0
    ? ` 全部通过：${results.length}/${results.length}`
    : ` 通过 ${results.length - failed.length} 项，失败 ${failed.length} 项`,
)
failed.forEach((item) => console.log(`  - ${item.name} => ${item.detail}`))
console.log(` 截图目录：${OUT_DIR}`)
console.log('============================================================')
console.log('')

process.exit(failed.length === 0 ? 0 : 1)
```

- [ ] **Step 2: 运行脚本，确认失败**

先执行 `pnpm backend:cache:flush` 清掉 24 小时站点配置缓存，确保后端新 `nav` 生效。

Run: `node scripts/verify-search-ui.mjs`
Expected: FAIL —— 头部还没有 `data-testid="site-nav"` 容器与搜索框（导航数据本身已是 5 项，因为 Task 2 已改后端并清过缓存），因此导航断言与搜索框断言均失败

- [ ] **Step 3: 新建 `HeaderSearch.vue`**

`web-portal/src/components/HeaderSearch.vue`：

```vue
<script setup lang="ts">
/**
 * 头部站内搜索输入框
 *
 * 只负责「收集关键词 → 提交」，不持有搜索结果状态、不直接调用接口。
 * 搜索结果页以 URL 的 q 为唯一数据源，因此刷新、分享链接、再次搜索的行为一致。
 */
import { ref } from 'vue'
import { useRouter } from 'vue-router'

const props = withDefaults(
  defineProps<{
    /** 与后端 MaxLength 校验保持一致 */
    maxLength?: number
    /** 初始值：在搜索页时回填当前关键词 */
    initialValue?: string
  }>(),
  { maxLength: 50, initialValue: '' },
)

const router = useRouter()
const keyword = ref(props.initialValue)

function submit(): void {
  const value = keyword.value.trim()
  // 空关键词不是错误：不跳转、不提示，保持在当前页面
  if (!value) return
  void router.push({ name: 'search', query: { q: value } })
}
</script>

<template>
  <form data-testid="header-search" class="flex items-center gap-2" @submit.prevent="submit">
    <label class="sr-only" for="header-search-input">搜索站内文章</label>
    <input
      id="header-search-input"
      v-model="keyword"
      data-testid="header-search-input"
      type="text"
      :maxlength="props.maxLength"
      placeholder="搜索"
      autocomplete="off"
      class="w-[150px] border-b border-rule bg-transparent pb-1 text-[13.5px] text-ink placeholder:text-ink-muted focus:border-accent focus:outline-none md:w-[180px]"
    />
    <button
      type="submit"
      data-testid="header-search-submit"
      class="text-[13.5px] text-ink-soft transition-colors duration-200 hover:text-accent"
    >
      搜索
    </button>
  </form>
</template>
```

- [ ] **Step 4: 改造 `SiteHeader.vue`**

整体替换为：

```vue
<script setup lang="ts">
/**
 * 站点页头
 * 桌面（≥768px）单行：左侧站点名 + 副标题，右侧导航链接组 + 站内搜索框；
 * 窄屏导航换行、搜索框独占一行。
 * 导航项来自后端 site-config（有 24 小时缓存，改动后需执行 cache:flush）。
 */
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useSiteConfigStore } from '@/stores/siteConfig'
import HeaderSearch from '@/components/HeaderSearch.vue'

const siteConfigStore = useSiteConfigStore()
const route = useRoute()

const siteName = computed(() => siteConfigStore.config.siteName)
const subtitle = computed(() => siteConfigStore.config.siteSubtitle)
const nav = computed(() => siteConfigStore.config.nav ?? [])
/** 在搜索页时把当前关键词回填到搜索框 */
const currentKeyword = computed(() => (typeof route.query.q === 'string' ? route.query.q : ''))

function isActive(path: string): boolean {
  if (path.startsWith('/#')) return route.path === '/' && route.hash === path.slice(1)
  return route.path === path
}
</script>

<template>
  <header class="rule-bottom">
    <div class="shell flex flex-col gap-4 py-6 md:flex-row md:items-baseline md:justify-between md:py-8">
      <RouterLink :to="{ name: 'home' }" class="group inline-block">
        <h1 class="font-serif text-2xl leading-none font-semibold tracking-tight text-ink md:text-[1.75rem]">
          {{ siteName }}
        </h1>
        <p class="mt-2 text-[13px] text-ink-muted">{{ subtitle }}</p>
      </RouterLink>

      <div class="flex flex-col gap-3 md:flex-row md:items-center md:gap-6">
        <nav
          data-testid="site-nav"
          class="flex flex-wrap items-center gap-x-5 gap-y-2 text-[13.5px] text-ink-soft md:gap-x-6"
        >
          <RouterLink
            v-for="entry in nav"
            :key="entry.path"
            :to="entry.path"
            class="transition-colors duration-200 hover:text-accent"
            :class="isActive(entry.path) ? 'text-ink' : ''"
          >
            {{ entry.label }}
          </RouterLink>
        </nav>

        <HeaderSearch :initial-value="currentKeyword" />
      </div>
    </div>
  </header>
</template>
```

- [ ] **Step 5: 临时加一条路由让搜索跳转不报错**

本步骤只为让 Task 3 的断言可独立通过；Task 4 会把 `SearchView` 换成真实页面。
在 `web-portal/src/router/index.ts` 的 `portalRoutes` 数组里追加：

```ts
  {
    path: '/search',
    name: 'search',
    component: () => import('@/views/SearchView.vue'),
    meta: { title: '搜索' },
  },
```

同一任务内创建最小可用的 `web-portal/src/views/SearchView.vue`（Task 4 会替换为完整实现）：

```vue
<script setup lang="ts">
/** 搜索结果页（占位实现，Task 4 补齐列表与空态） */
import { computed } from 'vue'
import { useRoute } from 'vue-router'

const route = useRoute()
const keyword = computed(() => (typeof route.query.q === 'string' ? route.query.q : ''))
</script>

<template>
  <div class="shell">
    <div class="rule-top mt-12 py-16">
      <h2 class="font-serif text-xl font-semibold text-ink">搜索</h2>
      <p class="mt-3 text-[0.95rem] text-ink-soft">关键词：{{ keyword }}</p>
    </div>
  </div>
</template>
```

- [ ] **Step 6: 构建并运行验证，确认通过**

```bash
pnpm --filter @sanmuzi/web-portal build
node scripts/verify-search-ui.mjs
```

Expected: 构建 0 错误；脚本「[1] 头部导航与搜索框」与「[2] 搜索框交互」全部 PASS

- [ ] **Step 7: 提交**

```bash
git add web-portal/src/components/HeaderSearch.vue web-portal/src/components/SiteHeader.vue web-portal/src/router/index.ts web-portal/src/views/SearchView.vue scripts/verify-search-ui.mjs
git commit -m "feat(portal): 头部导航扩展为五项并接入站内搜索框"
```

---

### Task 4: 搜索结果页

**Files:**
- Modify: `web-portal/src/views/SearchView.vue`（替换 Task 3 的占位实现）
- Modify: `web-portal/src/api/article.ts`
- Modify: `scripts/verify-search-ui.mjs`（追加搜索结果断言）

**Interfaces:**
- Consumes: `GET /api/portal/articles/search`（Task 2）、`BlogCard`、`ArticleCardSkeleton`、`EmptyState`、`HOME_PAGE_SIZE`
- Produces: `fetchPortalSearch(query: { keyword: string; page?: number; pageSize?: number }): Promise<PageResult<ArticleListItemVo>>`

- [ ] **Step 1: 追加失败的断言**

在 `scripts/verify-search-ui.mjs` 的「[3] 控制台与网络」分组**之前**插入：

```js
  console.log('')
  console.log('[3] 搜索结果页')
  const searchApi = await page.evaluate(async () => {
    const response = await fetch('/api/portal/articles/search?keyword=' + encodeURIComponent('显示器') + '&page=1&pageSize=9')
    const json = await response.json()
    return { code: json.code, total: json.data.total, ids: json.data.list.map((item) => item.id), firstTitle: json.data.list[0]?.title ?? '' }
  })

  const searchPage = await page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll('[data-testid="blog-card"]'))
    return {
      cardCount: cards.length,
      firstTitle: (cards[0]?.querySelector('h2')?.textContent ?? '').trim(),
      hasResultCount: (document.body.innerText ?? '').includes(String(cards.length)),
      pageText: (document.body.innerText ?? '').replace(/\s+/g, ' ').slice(0, 100),
    }
  })

  check('搜索页结果数量与接口一致', searchPage.cardCount === searchApi.ids.length && searchPage.cardCount > 0, `页面=${searchPage.cardCount} / 接口=${searchApi.ids.length}`)
  check('首条结果标题与接口一致', searchPage.firstTitle === searchApi.firstTitle, `页面=「${searchPage.firstTitle}」/ 接口=「${searchApi.firstTitle}」`)

  await page.screenshot({ path: resolve(OUT_DIR, 'search-02-results.png'), fullPage: true })

  // 无命中：显示空态且文案包含用户输入的关键词
  await page.goto(`${BASE_URL}/search?q=zzz-no-such-article-zzz`, { waitUntil: 'networkidle2' })
  await sleep(1800)
  const emptyState = await page.evaluate(() => ({
    cardCount: document.querySelectorAll('[data-testid="blog-card"]').length,
    text: (document.body.innerText ?? '').replace(/\s+/g, ' '),
  }))
  check('无命中时不渲染任何卡片', emptyState.cardCount === 0, `cards=${emptyState.cardCount}`)
  check('无命中显示空态且包含关键词', emptyState.text.includes('zzz-no-such-article-zzz'), `文本片段=「${emptyState.text.slice(0, 90)}」`)

  // 点击结果卡片进入详情页
  await page.goto(`${BASE_URL}/search?q=显示器`, { waitUntil: 'networkidle2' })
  await page.waitForSelector('[data-testid="blog-card"]', { timeout: 20000 })
  await sleep(1200)
  const detailErrorsBefore = consoleErrors.length
  await page.evaluate(() => {
    document.querySelector('[data-testid="blog-card"] a')?.click()
  })
  await page.waitForFunction(() => location.pathname.startsWith('/article/'), { timeout: 20000 })
  await sleep(2000)
  const detail = await page.evaluate(() => ({
    path: location.pathname,
    title: (document.querySelector('[data-testid="article-title"]')?.textContent ?? '').trim(),
    proseLength: (document.querySelector('.prose-article')?.innerText ?? '').replace(/\u200b/g, '').trim().length,
  }))
  check('点击搜索结果进入详情页', detail.path.startsWith('/article/'), `path=${detail.path}`)
  check('详情页标题与正文渲染成功', detail.title.length > 0 && detail.proseLength > 50, `标题=「${detail.title}」正文 ${detail.proseLength} 字符`)
  check('详情页无新增控制台错误', consoleErrors.length === detailErrorsBefore, `新增=${consoleErrors.length - detailErrorsBefore}`)
```

同时把原来 `console.log('[3] 控制台与网络')` 改为 `console.log('[5] 控制台与网络')`。

- [ ] **Step 2: 运行，确认失败**

Run: `node scripts/verify-search-ui.mjs`
Expected: 新增断言 FAIL（占位页没有卡片列表与空态）

- [ ] **Step 3: 在 `web-portal/src/api/article.ts` 新增搜索接口**

```ts
/** 站内搜索：匹配标题、摘要与正文，覆盖全部已上架文章 */
export function fetchPortalSearch(query: {
  keyword: string
  page?: number
  pageSize?: number
}): Promise<PageResult<ArticleListItemVo>> {
  return httpGet<PageResult<ArticleListItemVo>>('/api/portal/articles/search', {
    keyword: query.keyword,
    page: query.page ?? 1,
    pageSize: query.pageSize ?? 9,
  })
}
```

- [ ] **Step 4: 用完整实现替换 `SearchView.vue`**

```vue
<script setup lang="ts">
/**
 * 搜索结果页
 *
 * 唯一输入来源是 URL 的 q：刷新、分享链接、从头部再次搜索的行为完全一致。
 * 关键词变化即重新查询第一页，不做整页刷新。
 */
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import type { ArticleListItemVo } from '@sanmuzi/contracts'
import { fetchPortalSearch } from '@/api/article'
import { BizError } from '@/api/http'
import { HOME_PAGE_SIZE } from '@/config'
import BlogCard from '@/components/BlogCard.vue'
import ArticleCardSkeleton from '@/components/ArticleCardSkeleton.vue'
import EmptyState from '@/components/EmptyState.vue'

const route = useRoute()
const router = useRouter()

const keyword = computed(() => (typeof route.query.q === 'string' ? route.query.q.trim() : ''))
const articles = ref<ArticleListItemVo[]>([])
const total = ref(0)
const page = ref(1)
const loading = ref(false)
const loadingMore = ref(false)
const errorMessage = ref('')

const hasMore = computed(() => articles.value.length < total.value)

async function load(target: number, append: boolean): Promise<void> {
  const q = keyword.value
  if (!q) {
    articles.value = []
    total.value = 0
    return
  }
  if (append) loadingMore.value = true
  else loading.value = true
  errorMessage.value = ''
  try {
    const result = await fetchPortalSearch({ keyword: q, page: target, pageSize: HOME_PAGE_SIZE })
    articles.value = append ? [...articles.value, ...result.list] : result.list
    total.value = result.total
    page.value = result.page
  } catch (error) {
    errorMessage.value = error instanceof BizError ? error.message : '搜索失败，请稍后重试'
  } finally {
    loading.value = false
    loadingMore.value = false
  }
}

function loadMore(): void {
  if (loading.value || loadingMore.value || !hasMore.value) return
  void load(page.value + 1, true)
}

function goHome(): void {
  void router.push({ name: 'home' })
}

watch(keyword, () => void load(1, false), { immediate: true })
</script>

<template>
  <div class="shell">
    <section class="rule-top mt-12 pt-12 md:mt-14 md:pt-14">
      <div class="mb-8 flex items-baseline justify-between md:mb-10">
        <div>
          <h2 class="font-serif text-lg font-semibold text-ink">搜索</h2>
          <p v-if="keyword" class="mt-2 text-[13px] text-ink-muted">
            关键词「{{ keyword }}」<span v-if="total > 0">· 共 {{ total }} 篇</span>
          </p>
        </div>
        <button
          type="button"
          class="text-[13px] text-ink-muted transition-colors duration-200 hover:text-accent"
          @click="goHome"
        >
          返回推荐清单
        </button>
      </div>

      <ArticleCardSkeleton v-if="loading" :count="3" />

      <EmptyState
        v-else-if="errorMessage"
        title="搜索没能完成"
        :description="errorMessage"
        action-text="重新搜索"
        @action="load(1, false)"
      />

      <EmptyState
        v-else-if="articles.length === 0"
        title="没有找到相关内容"
        :description="`没有找到与「${keyword}」相关的内容，换个关键词试试，或者回到首页看看推荐清单。`"
        action-text="回到推荐清单"
        @action="goHome"
      />

      <template v-else>
        <div class="card-grid">
          <BlogCard v-for="(item, index) in articles" :key="item.id" :item="item" :priority="index < 2" />
        </div>

        <div v-if="hasMore" class="mt-16 flex justify-center md:mt-20">
          <button
            type="button"
            class="text-[13.5px] text-ink-soft transition-colors duration-200 hover:text-accent disabled:opacity-50"
            :disabled="loadingMore"
            @click="loadMore"
          >
            {{ loadingMore ? '加载中…' : '查看更多结果' }}
          </button>
        </div>
      </template>
    </section>
  </div>
</template>
```

- [ ] **Step 5: 构建并运行验证，确认通过**

```bash
pnpm --filter @sanmuzi/web-portal build
node scripts/verify-search-ui.mjs
```

Expected: 构建 0 错误；搜索页相关断言全部 PASS

- [ ] **Step 6: 提交**

```bash
git add web-portal/src/views/SearchView.vue web-portal/src/api/article.ts scripts/verify-search-ui.mjs
git commit -m "feat(portal): 搜索结果页（以 URL 关键词为唯一数据源）"
```

---

### Task 5: 关于本站页与两个占位页

**Files:**
- Create: `web-portal/src/views/AboutView.vue`
- Create: `web-portal/src/views/ComingSoonView.vue`
- Modify: `web-portal/src/router/index.ts`
- Modify: `scripts/verify-search-ui.mjs`（追加断言）

**Interfaces:**
- Consumes: `EmptyState`、`.prose-article` 全局样式
- Produces: 路由 `/about`（`name: 'about'`）、`/category`（`name: 'category'`）、`/subscribe`（`name: 'subscribe'`）

- [ ] **Step 1: 追加失败的断言**

在 `scripts/verify-search-ui.mjs` 的「[5] 控制台与网络」分组**之前**插入：

```js
  console.log('')
  console.log('[4] 关于本站与占位页')
  const pages = [
    { name: '关于本站', path: '/about', expectText: '关于本站', minLength: 200 },
    { name: '分类占位页', path: '/category', expectText: '分类', minLength: 20 },
    { name: '邮件订阅占位页', path: '/subscribe', expectText: '邮件订阅', minLength: 20 },
  ]

  for (const item of pages) {
    const errorsBefore = consoleErrors.length
    await page.goto(`${BASE_URL}${item.path}`, { waitUntil: 'networkidle2', timeout: 60000 })
    await sleep(1200)
    await page.screenshot({ path: resolve(OUT_DIR, `search-03-${item.path.replace('/', '')}.png`) })
    const state = await page.evaluate(() => ({
      text: (document.body.innerText ?? '').replace(/\s+/g, ' '),
      hasProse: Boolean(document.querySelector('.prose-article')),
      hasComingSoon: Boolean(document.querySelector('[data-testid="coming-soon"]')),
      titleText: document.title,
    }))
    check(
      `${item.name} 渲染成功`,
      state.text.includes(item.expectText) && state.text.length >= item.minLength && consoleErrors.length === errorsBefore,
      `正文 ${state.text.length} 字符，prose=${state.hasProse}，comingSoon=${state.hasComingSoon}，新增报错=${consoleErrors.length - errorsBefore}`,
    )
    if (item.path === '/about') {
      check('关于本站使用正文排版（.prose-article）', state.hasProse)
    } else {
      check(`${item.name} 使用「即将上线」占位组件`, state.hasComingSoon)
    }
  }
```

- [ ] **Step 2: 运行，确认失败**

Run: `node scripts/verify-search-ui.mjs`
Expected: FAIL —— `/about`、`/category`、`/subscribe` 尚未注册，会落到访客端 404

- [ ] **Step 3: 新建 `ComingSoonView.vue`**

`web-portal/src/views/ComingSoonView.vue`：

```vue
<script setup lang="ts">
/**
 * 「即将上线」占位页
 * 被 /category 与 /subscribe 复用，标题取路由 meta.title —— 一个组件服务两个入口。
 */
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import EmptyState from '@/components/EmptyState.vue'

const route = useRoute()
const router = useRouter()

const title = computed(() => (route.meta.title ? String(route.meta.title) : '该功能'))
</script>

<template>
  <div class="shell">
    <EmptyState
      data-testid="coming-soon"
      :title="`${title}即将上线`"
      description="这个入口已经占好位置，功能正在开发中。当前可以先用首页推荐清单和顶部搜索浏览内容。"
      action-text="回到推荐清单"
      @action="router.push({ name: 'home' })"
    />
  </div>
</template>
```

- [ ] **Step 4: 新建 `AboutView.vue`**

`web-portal/src/views/AboutView.vue`：

```vue
<script setup lang="ts">
/**
 * 关于本站（静态内容页）
 * 文案写在前端，不占后端字段；排版复用全局 .prose-article。
 */
</script>

<template>
  <div class="shell">
    <article class="mx-auto max-w-[46rem] pb-16">
      <header class="pt-12 md:pt-16">
        <h1 class="font-serif text-[1.875rem] leading-tight font-semibold text-ink md:text-[2.5rem]">关于本站</h1>
        <p class="mt-5 font-serif text-[1.0625rem] leading-relaxed text-ink-soft md:text-[1.125rem]">
          一个不接稿、不带货的产品推荐博客。只写自己长期用过的东西。
        </p>
      </header>

      <div class="prose-article rule-top mt-12 pt-12 md:mt-14 md:pt-14">
        <h2>我们在做什么</h2>
        <p>
          这个站点的内容只有一类：我们自己买、自己用、用够长时间之后，值得写下来的产品。
          覆盖显示器、耳机、键鼠、桌面与家居好物。不做开箱即评，不做参数复读，
          每篇都给出明确的购买建议和避坑提示。
        </p>

        <h2>评测原则</h2>
        <ul>
          <li><strong>自费购买。</strong>不接受厂商送测，不接付费软文，因此结论不受干扰。</li>
          <li><strong>长期使用。</strong>至少连续使用一个月才动笔；短期体验不足以判断耐用性。</li>
          <li><strong>说清适用边界。</strong>没有「适合所有人」的产品，每篇都会写清什么场景下别买。</li>
          <li><strong>参数服务于体验。</strong>只讲参数里真正影响日常使用的那部分，其余略过。</li>
        </ul>

        <h2>关于推广链接</h2>
        <p>
          站内部分购买链接带有推广标识。这不会影响结论——推荐与否、优缺点怎么写，
          都在挂链接之前就定了。如果你介意，直接搜索型号购买也完全一样。
        </p>

        <h2>联系方式与投稿</h2>
        <p>
          内容纠错、选品建议、合作咨询，都可以通过邮件联系。如果你有想看的品类，
          也欢迎告诉我，我会把它排进评测计划。
        </p>
        <blockquote>
          <p>邮件的回复可能不快，但每一封都会看。</p>
        </blockquote>

        <h2>这个站点是怎么搭的</h2>
        <p>
          前台是 Vue 3 + Vite + TailwindCSS，后台是 NestJS + Prisma + MySQL，
          短视频封面由服务端调用 FFmpeg 抽帧生成。整套代码开源在 GitHub 上。
        </p>
      </div>

      <footer class="rule-top mt-16 pt-8">
        <RouterLink :to="{ name: 'home' }" class="text-[13.5px] text-ink-soft transition-colors duration-200 hover:text-accent">
          ← 回到推荐清单
        </RouterLink>
      </footer>
    </article>
  </div>
</template>
```

- [ ] **Step 5: 在 `router/index.ts` 注册三条路由**

在 `portalRoutes` 数组里 `/search` 之后追加：

```ts
  {
    path: '/about',
    name: 'about',
    component: () => import('@/views/AboutView.vue'),
    meta: { title: '关于本站' },
  },
  {
    path: '/category',
    name: 'category',
    component: () => import('@/views/ComingSoonView.vue'),
    meta: { title: '分类' },
  },
  {
    path: '/subscribe',
    name: 'subscribe',
    component: () => import('@/views/ComingSoonView.vue'),
    meta: { title: '邮件订阅' },
  },
```

- [ ] **Step 6: 构建并运行验证，确认通过**

```bash
pnpm --filter @sanmuzi/web-portal build
node scripts/verify-search-ui.mjs
```

Expected: 构建 0 错误；`verify-search-ui.mjs` 全部通过

- [ ] **Step 7: 提交**

```bash
git add web-portal/src/views/AboutView.vue web-portal/src/views/ComingSoonView.vue web-portal/src/router/index.ts scripts/verify-search-ui.mjs
git commit -m "feat(portal): 关于本站页与分类/邮件订阅占位页"
```

---

### Task 6: 文档、缓存刷新与全量回归

**Files:**
- Modify: `package.json`（新增验证脚本入口）
- Modify: `README.md`
- Modify: `docs/API.md`
- Modify: `docs/UPDATE_LOG.md`

**Interfaces:**
- Consumes: 前五个任务的全部产出
- Produces: 无新接口；`pnpm verify:search-ui` 与 `pnpm verify:all` 可一键回归

- [ ] **Step 1: 在根 `package.json` 的 scripts 里新增入口**

```json
    "verify:search-ui": "node scripts/verify-search-ui.mjs --url=http://localhost:5173",
```

并把 `verify:all` 改为：

```json
    "verify:all": "pnpm verify:portal-ui && pnpm verify:search-ui && pnpm verify:admin-ui && pnpm verify:article-edit && pnpm smoke",
```

- [ ] **Step 2: 更新 `docs/API.md`**

在「三、前台门户接口（全部公开）」小节里新增搜索接口说明：

```markdown
### GET /api/portal/articles/search

站内搜索。按关键词匹配**标题、摘要与富文本正文**（三者 OR），覆盖**全部已上架文章**（不限于首页推荐位）。

| 参数 | 必填 | 说明 |
| --- | --- | --- |
| `keyword` | 是 | 1–50 字；为空或全空格返回 `40000`，超过 50 字返回 `40000` |
| `page` / `pageSize` | 否 | 同其他列表接口 |

排序 `sort DESC, updatedAt DESC`；响应为 `PageResult<ArticleListItemVo>`，**不含 `content`**。

不做 Redis 缓存（每个关键词一个缓存键会污染缓存空间）。正文使用 `LIKE '%kw%'` 匹配，无法使用索引，内容规模上来后需改用 MySQL 全文索引。

**可见性规则变更（v1.2.0）**：`GET /api/portal/articles/:id` 此前要求 `isPublish && isRecommend`，现已对齐为**只校验 `isPublish`**。
理由是 `isPublish` 决定「能否被访问」、`isRecommend` 只决定「是否出现在首页推荐位」。若不改，搜索会返回「已上架但未推荐」的文章，而点进去是 404。
首页列表 `GET /api/portal/articles` 的规则（`isRecommend && isPublish`）**保持不变**。
```

- [ ] **Step 3: 更新 `README.md`**

在常用脚本表里新增一行（放在 `verify:article-edit` 之前）：

```markdown
| `pnpm verify:search-ui` | 前台导航与站内搜索渲染验证（无头 Chrome，含搜索流程与占位页） |
```

并把「`pnpm verify:all`」一行的断言总数改为实测值。

- [ ] **Step 4: 更新 `docs/UPDATE_LOG.md`**

在最前面插入新版本章节，必须包含：

1. **行为变更声明**：`GET /api/portal/articles/:id` 的可见性从 `isPublish && isRecommend` 放宽为 `isPublish`，并写明原因与影响面（已上架未推荐的文章从此可通过直接 URL 访问）。
2. 新增搜索端点与前端四个入口。
3. 本次实测的四套验证结果与断言总数。
4. 已知限制：正文 LIKE 走不了索引、无相关性排序、无关键词高亮、搜索端点无限流。

- [ ] **Step 5: 清缓存并跑全量回归**

```bash
pnpm backend:cache:flush
pnpm verify:all
```

Expected: 四套验证全部通过，无失败项

- [ ] **Step 6: 人工确认头部新导航已生效**

```bash
node -e "fetch('http://localhost:3000/api/portal/site-config').then(r=>r.json()).then(j=>console.log(j.data.nav))"
```

Expected: 输出 5 项导航（首页 / 全部推荐 / 分类 / 关于本站 / 邮件订阅）。若仍是 2 项，说明 Redis 缓存的旧站点配置未被清除，需重新执行 `pnpm backend:cache:flush`。

- [ ] **Step 7: 提交并推送**

```bash
git add package.json README.md docs/API.md docs/UPDATE_LOG.md
git commit -m "docs: 站内搜索接口文档、更新记录与验证脚本入口"
git push origin main
```

---

## 完成标准

- [ ] 头部五个入口全部渲染且链接正确
- [ ] 搜索框可用：空提交不跳转、有词回车跳转 `/search?q=`
- [ ] 搜索结果页条数与接口一致、无命中显示空态、点击可进详情页
- [ ] `/about` 有真实内容，`/category` 与 `/subscribe` 为「即将上线」占位页
- [ ] `GET /api/portal/articles/search` 覆盖标题/摘要/正文，仅返回已上架文章，不含 `content`
- [ ] 详情接口可见性对齐后：已上架未推荐文章可搜索命中且可打开，下架后返回 `40400`
- [ ] `pnpm verify:all` 四套验证全部通过
- [ ] `docs/UPDATE_LOG.md` 明确标注了详情接口的行为变更
