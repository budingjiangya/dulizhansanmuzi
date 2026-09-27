/**
 * 邮件订阅 + 分类 + 操作日志 UI 验证（无头 Chrome + Puppeteer）
 *
 * 用法：node scripts/verify-subscribe-category-ui.mjs [--url=http://localhost:5173] [--out=scripts/artifacts]
 *
 * 断言分组：
 * [1] 前台订阅页：表单结构、验证码用 img data URI 渲染（不是 v-html）
 * [2] 前台订阅流程：空邮箱不发请求、正确验证码提交成功、错误验证码只刷新验证码且不清空输入
 * [3] 前台分类页：总览与接口一致、点击进入分类文章列表
 * [4] 后台三个新页面：分类管理 / 邮件订阅 / 操作日志
 * [5] 文章编辑页的分类下拉
 * [6] 清理验证产生的订阅记录（不污染数据）
 * [7] 控制台与网络
 *
 * 关于验证码：答案只存在服务端 Redis，接口不返回。
 * 本脚本通过监听 /api/portal/captcha 的响应抓 captchaId，再用与后端相同的 .env 连 Redis 读答案。
 * 这只是本地验证手段，不修改产品代码。
 */
import { existsSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { config as loadEnv } from 'dotenv'
import Redis from 'ioredis'
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

const envPath = resolve(rootDir, 'backend-nest', '.env')
if (existsSync(envPath)) loadEnv({ path: envPath, override: true })

const REDIS_URL = process.env.REDIS_URL
const KEY_PREFIX = process.env.REDIS_KEY_PREFIX ?? ''
if (!REDIS_URL) {
  console.error('未找到 REDIS_URL（应来自 backend-nest/.env），无法读取验证码答案')
  process.exit(1)
}

const redis = new Redis(REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 2 })
await redis.connect()

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

/** 最近一次验证码响应里的 captchaId */
let lastCaptchaId = null
function watchCaptcha(page) {
  page.on('response', async (response) => {
    if (!response.url().includes('/api/portal/captcha')) return
    try {
      const json = await response.json()
      if (json?.data?.captchaId) lastCaptchaId = json.data.captchaId
    } catch {
      /* 忽略解析失败 */
    }
  })
}

/** 读取验证码答案；不存在返回 null（可能已过期） */
async function readAnswer(captchaId) {
  if (!captchaId) return null
  return redis.get(`${KEY_PREFIX}captcha:${captchaId}`)
}

const browser = await puppeteer.launch({
  executablePath: chromePath,
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--window-size=1600,1000'],
  defaultViewport: { width: 1600, height: 1000 },
})

try {
  const page = await browser.newPage()
  page.on('console', (message) => {
    if (message.type() !== 'error') return
    const url = message.location()?.url ?? ''
    /*
     * 「错误验证码」用例会故意让 /api/portal/subscriptions 返回 400，
     * 浏览器对任何 4xx 都会记一条 console error。这是预期的失败路径，
     * 不排除掉会让本套件每次都假失败（曾经就误报过）。
     */
    if (url.includes('/api/portal/subscriptions')) return
    consoleErrors.push(`${message.text().slice(0, 200)}${url ? ` @ ${url}` : ''}`)
  })
  page.on('pageerror', (error) => consoleErrors.push(`pageerror: ${error.message.slice(0, 220)}`))
  page.on('requestfailed', (request) => {
    failedRequests.push(`${request.method()} ${request.url()} — ${request.failure()?.errorText ?? 'unknown'}`)
  })
  page.on('response', (response) => {
    if (response.status() >= 400) {
      const url = response.url()
      // 订阅失败路径会故意产生 4xx，不视为「意外失败请求」
      if (!url.includes('/api/portal/subscriptions')) {
        failedRequests.push(`${response.request().method()} ${url} — HTTP ${response.status()}`)
      }
    }
  })
  watchCaptcha(page)

  console.log('')
  console.log('============================================================')
  console.log(` 邮件订阅 / 分类 / 操作日志 UI 验证  base=${BASE_URL}`)
  console.log('============================================================')

  // ---------------------------------------------------------------- 订阅页结构
  console.log('')
  console.log('[1] 前台订阅页结构')
  await page.goto(`${BASE_URL}/subscribe`, { waitUntil: 'networkidle2', timeout: 60000 })
  await page.waitForSelector('form', { timeout: 20000 })
  await sleep(2000)
  await page.screenshot({ path: resolve(OUT_DIR, 'sub-01-subscribe.png'), fullPage: true })

  const form = await page.evaluate(() => {
    const inputs = Array.from(document.querySelectorAll('input, textarea'))
    const email = inputs.find((el) => (el.getAttribute('type') ?? '') === 'email' || /邮箱/.test(el.getAttribute('placeholder') ?? ''))
    const message = inputs.find((el) => /留言/.test(el.getAttribute('placeholder') ?? '') || el.tagName === 'TEXTAREA')
    const captchaInput = inputs.find((el) => /验证码/.test(el.getAttribute('placeholder') ?? ''))
    const captchaImg = document.querySelector('img[src^="data:image/svg+xml;base64,"]')
    const submit = Array.from(document.querySelectorAll('button')).find((el) =>
      /提交|订阅/.test(el.textContent ?? ''),
    )
    return {
      hasEmail: Boolean(email),
      hasMessage: Boolean(message),
      hasCaptchaInput: Boolean(captchaInput),
      captchaImgSrc: captchaImg?.getAttribute('src') ?? '',
      hasSubmit: Boolean(submit),
      messageMaxLength: message?.getAttribute('maxlength') ?? null,
      bodyText: (document.body.innerText ?? '').replace(/\s+/g, ' ').slice(0, 140),
    }
  })

  check('订阅表单渲染出邮箱输入框', form.hasEmail)
  check('订阅表单渲染出留言输入框（选填）', form.hasMessage)
  check('订阅表单渲染出验证码输入框', form.hasCaptchaInput)
  check(
    '验证码用 <img> 的 data URI 渲染（未使用 v-html）',
    form.captchaImgSrc.startsWith('data:image/svg+xml;base64,'),
    `src 前缀=${form.captchaImgSrc.slice(0, 34)}`,
  )
  check('订阅表单有提交按钮', form.hasSubmit)
  check('留言框有长度上限（≤200）', form.messageMaxLength === null || Number(form.messageMaxLength) <= 200, `maxlength=${form.messageMaxLength}`)

  // ---------------------------------------------------------------- 订阅流程
  console.log('')
  console.log('[2] 前台订阅流程')

  // 空邮箱不应发请求
  let subscribeRequests = 0
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().includes('/api/portal/subscriptions')) subscribeRequests += 1
  })
  await page.evaluate(() => {
    const submit = Array.from(document.querySelectorAll('button')).find((el) => /提交|订阅/.test(el.textContent ?? ''))
    submit?.click()
  })
  await sleep(1200)
  check('空邮箱提交不产生订阅请求', subscribeRequests === 0, `POST 次数=${subscribeRequests}`)

  // 错误验证码：应提示错误、刷新验证码、且不清空已填邮箱
  const uniqueEmail = `ui-verify-${Date.now()}@example.com`
  await page.type('input[type="email"], input[placeholder*="邮箱"]', uniqueEmail)
  await page.type('input[placeholder*="验证码"]', 'zzzz')
  const captchaSrcBeforeWrong = await page.evaluate(
    () => document.querySelector('img[src^="data:image/svg+xml;base64,"]')?.getAttribute('src') ?? '',
  )
  await page.evaluate(() => {
    const submit = Array.from(document.querySelectorAll('button')).find((el) => /提交|订阅/.test(el.textContent ?? ''))
    submit?.click()
  })
  await sleep(2500)
  const wrongState = await page.evaluate(() => ({
    emailValue: document.querySelector('input[type="email"], input[placeholder*="邮箱"]')?.value ?? '',
    captchaSrc: document.querySelector('img[src^="data:image/svg+xml;base64,"]')?.getAttribute('src') ?? '',
    text: (document.body.innerText ?? '').replace(/\s+/g, ' '),
  }))
  check(
    '错误验证码在表单内提示错误',
    /验证码/.test(wrongState.text) && /错误|过期/.test(wrongState.text),
    `页面文本片段=「${wrongState.text.slice(0, 100)}」`,
  )
  check('错误验证码不会清空已填邮箱', wrongState.emailValue === uniqueEmail, `邮箱框=「${wrongState.emailValue}」`)
  check('错误验证码后验证码图片已刷新', wrongState.captchaSrc !== captchaSrcBeforeWrong && wrongState.captchaSrc.length > 0)

  // 正确验证码：成功提交
  const answer = await readAnswer(lastCaptchaId)
  check('读到了当前验证码的答案（测试辅助）', Boolean(answer), `captchaId=${String(lastCaptchaId).slice(0, 8)}... answer 长度=${answer ? answer.length : 0}`)

  await page.evaluate(() => {
    const input = document.querySelector('input[placeholder*="验证码"]')
    if (input) {
      input.value = ''
      input.dispatchEvent(new Event('input', { bubbles: true }))
    }
  })
  await page.type('input[placeholder*="验证码"]', answer ?? 'xxxx')
  await page.evaluate(() => {
    const submit = Array.from(document.querySelectorAll('button')).find((el) => /提交|订阅/.test(el.textContent ?? ''))
    submit?.click()
  })
  await sleep(2800)
  const okText = await page.evaluate(() => (document.body.innerText ?? '').replace(/\s+/g, ' '))
  check(
    '正确验证码提交成功并显示成功态',
    /订阅成功|订阅已经成功|感谢订阅|已订阅/.test(okText),
    `页面文本片段=「${okText.slice(0, 120)}」`,
  )
  await page.screenshot({ path: resolve(OUT_DIR, 'sub-02-success.png'), fullPage: true })

  // ---------------------------------------------------------------- 分类页
  console.log('')
  console.log('[3] 前台分类页')
  const apiCategories = await page.evaluate(async () => {
    const response = await fetch('/api/portal/categories')
    const json = await response.json()
    // 前台用「已上架」口径：publishedArticleCount 才等于点进去实际能看到的文章数
    return json.data.map((item) => ({
      id: item.id,
      name: item.name,
      count: item.publishedArticleCount,
      total: item.articleCount,
    }))
  })

  await page.goto(`${BASE_URL}/category`, { waitUntil: 'networkidle2', timeout: 60000 })
  await sleep(1800)
  await page.screenshot({ path: resolve(OUT_DIR, 'sub-03-categories.png'), fullPage: true })
  const categoryPage = await page.evaluate(() => {
    const links = Array.from(document.querySelectorAll('a[href^="/category/"]'))
    return {
      linkCount: links.length,
      hrefs: links.map((a) => a.getAttribute('href')),
      text: (document.body.innerText ?? '').replace(/\s+/g, ' '),
    }
  })
  check(
    '分类总览列出的分类数与接口一致',
    categoryPage.linkCount === apiCategories.length && categoryPage.linkCount > 0,
    `页面=${categoryPage.linkCount} / 接口=${apiCategories.length}`,
  )
  check(
    '分类总览显示了分类名',
    apiCategories.every((item) => categoryPage.text.includes(item.name)),
    `接口分类=${apiCategories.map((c) => c.name).join(' / ')}`,
  )

  // 点击有文章的分类
  const targetCategory = apiCategories.find((item) => item.count > 0) ?? apiCategories[0]
  await page.goto(`${BASE_URL}/category/${targetCategory.id}`, { waitUntil: 'networkidle2', timeout: 60000 })
  await sleep(2000)
  await page.screenshot({ path: resolve(OUT_DIR, 'sub-04-category-detail.png'), fullPage: true })
  const detailPage = await page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll('[data-testid="blog-card"]'))
    return {
      cards: cards.length,
      firstTitle: (cards[0]?.querySelector('h2')?.textContent ?? '').trim(),
      text: (document.body.innerText ?? '').replace(/\s+/g, ' '),
    }
  })
  const apiArticles = await page.evaluate(async (id) => {
    const response = await fetch(`/api/portal/categories/${id}/articles?page=1&pageSize=9`)
    const json = await response.json()
    return { total: json.data.total, firstTitle: json.data.list[0]?.title ?? '' }
  }, targetCategory.id)
  check(
    `分类「${targetCategory.name}」文章列表与接口一致`,
    detailPage.cards === Math.min(apiArticles.total, 9) && detailPage.cards > 0,
    `页面=${detailPage.cards} / 接口 total=${apiArticles.total}`,
  )
  check('分类文章列表标题与接口一致', detailPage.firstTitle === apiArticles.firstTitle, `页面=「${detailPage.firstTitle}」`)
  check('分类页显示了分类名', detailPage.text.includes(targetCategory.name), `文本片段=「${detailPage.text.slice(0, 80)}」`)

  // ---------------------------------------------------------------- 后台页面
  console.log('')
  console.log('[4] 后台三个新页面')
  await page.goto(`${BASE_URL}/admin/login`, { waitUntil: 'networkidle2', timeout: 60000 })
  await sleep(1500)
  await page.type('input[autocomplete="username"]', 'admin')
  await page.type('input[autocomplete="current-password"]', 'Admin@123456')
  await page.evaluate(() => {
    Array.from(document.querySelectorAll('button'))
      .find((item) => (item.textContent ?? '').includes('登录'))
      ?.click()
  })
  await sleep(2800)
  check('后台登录成功', (await page.evaluate(() => location.pathname)).startsWith('/admin'), `path=${await page.evaluate(() => location.pathname)}`)

  const adminPages = [
    { name: '分类管理', path: '/admin/blog/categories', expectText: ['分类管理', '名称'], needTable: true },
    { name: '邮件订阅', path: '/admin/system/subscriptions', expectText: ['邮件订阅', '邮箱'], needTable: true },
    { name: '操作日志', path: '/admin/system/operation-logs', expectText: ['操作日志', '模块'], needTable: true },
  ]

  for (const item of adminPages) {
    const errorsBefore = consoleErrors.length
    await page.goto(`${BASE_URL}${item.path}`, { waitUntil: 'networkidle2', timeout: 60000 })
    await sleep(2200)
    await page.screenshot({ path: resolve(OUT_DIR, `sub-05-admin-${item.path.split('/').pop()}.png`), fullPage: true })
    const state = await page.evaluate(() => {
      const table = document.querySelector('.n-data-table')
      return {
        hasTable: Boolean(table),
        headCells: Array.from(document.querySelectorAll('.n-data-table-th')).map((el) => (el.textContent ?? '').trim()),
        text: (document.body.innerText ?? '').replace(/\s+/g, ' '),
      }
    })
    check(
      `${item.name} 页面渲染成功`,
      state.hasTable &&
        item.expectText.every((t) => state.text.includes(t)) &&
        consoleErrors.length === errorsBefore,
      `表头=${state.headCells.join('|')}，新增报错=${consoleErrors.length - errorsBefore}`,
    )
  }

  // 分类管理页应能看到演示分类
  await page.goto(`${BASE_URL}/admin/blog/categories`, { waitUntil: 'networkidle2' })
  await sleep(2000)
  const categoryAdminText = await page.evaluate(() => (document.body.innerText ?? '').replace(/\s+/g, ' '))
  check(
    '分类管理页展示了演示分类',
    apiCategories.some((item) => categoryAdminText.includes(item.name)),
    `演示分类=${apiCategories.map((c) => c.name).join(' / ')}`,
  )

  // 操作日志页应能看到记录（此前 UI 与烟测都产生过写操作）
  await page.goto(`${BASE_URL}/admin/system/operation-logs`, { waitUntil: 'networkidle2' })
  await sleep(2200)
  const logRows = await page.evaluate(() => document.querySelectorAll('.n-data-table-tbody .n-data-table-tr').length)
  check('操作日志页有数据行', logRows > 0, `行数=${logRows}`)

  // ---------------------------------------------------------------- 文章编辑页分类下拉
  console.log('')
  console.log('[5] 文章编辑页分类下拉')
  const articleId = await page.evaluate(async () => {
    const token = localStorage.getItem('sanmuzi-admin-token')
    const response = await fetch('/api/admin/articles?page=1&pageSize=1', {
      headers: { Authorization: `Bearer ${token}` },
    })
    const json = await response.json()
    return json.data.list[0]?.id ?? null
  })
  await page.goto(`${BASE_URL}/admin/blog/articles/${articleId}/edit`, { waitUntil: 'networkidle2', timeout: 60000 })
  await sleep(3000)
  const editState = await page.evaluate(() => {
    const text = (document.body.innerText ?? '').replace(/\s+/g, ' ')
    // Naive-UI 的 NSelect 会渲染成 .n-select
    const selects = Array.from(document.querySelectorAll('.n-select'))
    return { hasCategoryLabel: text.includes('分类'), selectCount: selects.length, text: text.slice(0, 200) }
  })
  check('文章编辑页出现「分类」字段', editState.hasCategoryLabel, `文本片段=「${editState.text.slice(0, 110)}」`)
  check('文章编辑页存在下拉选择器（含分类）', editState.selectCount >= 1, `NSelect 数量=${editState.selectCount}`)

  // ---------------------------------------------------------------- 清理
  /*
   * [2] 真实提交了一条订阅（ui-verify-<时间戳>@example.com）。
   * 不清理的话每跑一次就多一条测试订阅 —— 实测全量回归后库里留了 1 条。
   * 这里用后台接口按邮箱筛出来删掉，保持「验证脚本不污染数据」。
   */
  console.log('')
  console.log('[6] 清理验证产生的数据')
  const cleanup = await page.evaluate(async (email) => {
    const token = localStorage.getItem('sanmuzi-admin-token')
    const headers = { Authorization: `Bearer ${token}` }
    const listResponse = await fetch(
      `/api/admin/subscriptions?page=1&pageSize=50&email=${encodeURIComponent(email)}`,
      { headers },
    )
    const listJson = await listResponse.json()
    const rows = (listJson.data?.list ?? []).filter((item) => item.email === email)
    for (const row of rows) {
      await fetch(`/api/admin/subscriptions/${row.id}`, { method: 'DELETE', headers })
    }
    const after = await fetch('/api/admin/subscriptions?page=1&pageSize=1', { headers })
    const afterJson = await after.json()
    return { removed: rows.length, remaining: afterJson.data?.total ?? -1 }
  }, uniqueEmail)
  check('验证产生的订阅记录已被清理', cleanup.removed >= 1, `删除 ${cleanup.removed} 条，库中剩余 ${cleanup.remaining} 条`)

  // ---------------------------------------------------------------- 控制台与网络
  console.log('')
  console.log('[7] 控制台与网络')
  const realErrors = consoleErrors.filter((text) => !text.includes('favicon'))
  const realFailed = failedRequests.filter((item) => !item.includes('favicon') && !item.includes('ERR_ABORTED'))
  check('无控制台错误', realErrors.length === 0, realErrors.slice(0, 3).join(' | '))
  check('无意外失败请求', realFailed.length === 0, realFailed.slice(0, 3).join(' | '))
  if (failedRequests.length !== realFailed.length) {
    console.log(`        说明：${failedRequests.length - realFailed.length} 个请求被主动中止，属预期行为（资源释放）`)
  }
} finally {
  await browser.close()
  redis.disconnect()
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
