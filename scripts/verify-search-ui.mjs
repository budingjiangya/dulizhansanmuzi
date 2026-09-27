/**
 * 前台导航与站内搜索 UI 验证（无头 Chrome + Puppeteer）
 *
 * 用法：node scripts/verify-search-ui.mjs [--url=http://localhost:5173] [--out=scripts/artifacts]
 *
 * 断言分组：
 * [1] 头部导航与搜索框（五个入口、路径、maxlength）
 * [2] 搜索框交互（空提交不跳转、有词跳转并带 q 参数）
 * [3] 搜索结果页（条数与接口一致、空态含关键词、点击进详情）
 * [4] 关于本站与占位页
 * [5] 控制台与网络
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

  // ---------------------------------------------------------------- 头部
  console.log('')
  console.log('[1] 头部导航与搜索框')
  await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle2', timeout: 60000 })
  await page.waitForSelector('[data-testid="blog-card"]', { timeout: 30000 })
  await sleep(1500)
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
    header.labels.length === EXPECTED_NAV.length &&
      EXPECTED_NAV.every((label, index) => header.labels[index] === label),
    `实际=${header.labels.join(' / ')}`,
  )
  check(
    '分类/关于本站/邮件订阅 指向正确路径',
    ['/category', '/about', '/subscribe'].every((path) => header.hrefs.includes(path)),
    `hrefs=${header.hrefs.join(' / ')}`,
  )
  check('搜索框已渲染', header.searchExists && header.inputExists)
  check('搜索框 maxlength 为 50（与后端校验一致）', header.inputMaxLength === '50', `maxlength=${header.inputMaxLength}`)

  // ---------------------------------------------------------------- 搜索框交互
  console.log('')
  console.log('[2] 搜索框交互')
  if (!header.searchExists || !header.inputExists) {
    // 搜索框不存在时不要抛异常中断整个脚本 —— 后续分组仍需继续跑并报告
    check('搜索框交互（搜索框不存在，无法验证）', false, '缺少 [data-testid="header-search-input"]')
  } else {
    const pathBefore = await page.evaluate(() => location.pathname)
    await page.click('[data-testid="header-search-input"]')
    await page.keyboard.press('Enter')
    await sleep(900)
    const afterEmptySubmit = await page.evaluate(() => location.pathname)
    check('空关键词提交不跳转', afterEmptySubmit === pathBefore, `path=${afterEmptySubmit}`)

    await page.type('[data-testid="header-search-input"]', '显示器')
    await Promise.all([
      page.waitForFunction(() => location.pathname === '/search', { timeout: 20000 }).catch(() => {}),
      page.keyboard.press('Enter'),
    ])
    await sleep(2200)
    const afterSubmit = await page.evaluate(() => ({ path: location.pathname, search: location.search }))
    check('输入关键词回车跳转到搜索页', afterSubmit.path === '/search', `path=${afterSubmit.path}`)
    check(
      'URL 携带关键词查询参数',
      decodeURIComponent(afterSubmit.search).includes('q=显示器'),
      `search=${decodeURIComponent(afterSubmit.search)}`,
    )
  }

  // ---------------------------------------------------------------- 搜索结果页
  console.log('')
  console.log('[3] 搜索结果页')
  const searchApi = await page.evaluate(async () => {
    const response = await fetch(
      '/api/portal/articles/search?keyword=' + encodeURIComponent('显示器') + '&page=1&pageSize=9',
    )
    const json = await response.json()
    return {
      code: json.code,
      total: json.data.total,
      ids: json.data.list.map((item) => item.id),
      firstTitle: json.data.list[0]?.title ?? '',
    }
  })

  const searchPage = await page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll('[data-testid="blog-card"]'))
    return {
      cardCount: cards.length,
      firstTitle: (cards[0]?.querySelector('h2')?.textContent ?? '').trim(),
      firstHref: cards[0]?.querySelector('a')?.getAttribute('href') ?? '',
    }
  })

  check('搜索接口返回成功', searchApi.code === 0 && searchApi.ids.length > 0, `total=${searchApi.total}`)
  check(
    '搜索页结果数量与接口一致',
    searchPage.cardCount === searchApi.ids.length && searchPage.cardCount > 0,
    `页面=${searchPage.cardCount} / 接口=${searchApi.ids.length}`,
  )
  check(
    '首条结果标题与接口一致',
    searchPage.firstTitle === searchApi.firstTitle && searchPage.firstTitle.length > 0,
    `页面=「${searchPage.firstTitle}」/ 接口=「${searchApi.firstTitle}」`,
  )

  await page.screenshot({ path: resolve(OUT_DIR, 'search-02-results.png'), fullPage: true })

  // 无命中：显示空态且文案包含用户输入的关键词
  await page.goto(`${BASE_URL}/search?q=zzz-no-such-article-zzz`, { waitUntil: 'networkidle2' })
  await sleep(2000)
  const emptyState = await page.evaluate(() => ({
    cardCount: document.querySelectorAll('[data-testid="blog-card"]').length,
    text: (document.body.innerText ?? '').replace(/\s+/g, ' '),
  }))
  check('无命中时不渲染任何卡片', emptyState.cardCount === 0, `cards=${emptyState.cardCount}`)
  check(
    '无命中显示空态且包含关键词',
    emptyState.text.includes('zzz-no-such-article-zzz'),
    `文本片段=「${emptyState.text.slice(0, 90)}」`,
  )

  // 点击结果卡片进入详情页
  await page.goto(`${BASE_URL}/search?q=显示器`, { waitUntil: 'networkidle2' })
  await page.waitForSelector('[data-testid="blog-card"]', { timeout: 20000 }).catch(() => {})
  await sleep(1500)
  const detailErrorsBefore = consoleErrors.length
  await page.evaluate(() => {
    document.querySelector('[data-testid="blog-card"] a')?.click()
  })
  await page.waitForFunction(() => location.pathname.startsWith('/article/'), { timeout: 20000 }).catch(() => {})
  await sleep(2200)
  const detail = await page.evaluate(() => ({
    path: location.pathname,
    title: (document.querySelector('[data-testid="article-title"]')?.textContent ?? '').trim(),
    proseLength: (document.querySelector('.prose-article')?.innerText ?? '').replace(/\u200b/g, '').trim().length,
  }))
  check('点击搜索结果进入详情页', detail.path.startsWith('/article/'), `path=${detail.path}`)
  check(
    '详情页标题与正文渲染成功',
    detail.title.length > 0 && detail.proseLength > 50,
    `标题=「${detail.title}」正文 ${detail.proseLength} 字符`,
  )
  check('详情页无新增控制台错误', consoleErrors.length === detailErrorsBefore, `新增=${consoleErrors.length - detailErrorsBefore}`)

  // ---------------------------------------------------------------- 关于本站与占位页
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
    await sleep(1500)
    await page.screenshot({ path: resolve(OUT_DIR, `search-03-${item.path.replace('/', '')}.png`) })
    const state = await page.evaluate(() => ({
      text: (document.body.innerText ?? '').replace(/\s+/g, ' '),
      hasProse: Boolean(document.querySelector('.prose-article')),
      hasComingSoon: Boolean(document.querySelector('[data-testid="coming-soon"]')),
    }))
    /*
     * 必须同时要求「渲染出了预期的组件」。
     * 只断言文本包含关键词是不可靠的：页面落到 404 时，头部导航里同样有「分类」「邮件订阅」字样，
     * 会造成假通过（实测曾经如此）。
     */
    const expectComponent = item.path === '/about' ? state.hasProse : state.hasComingSoon
    check(
      `${item.name} 渲染成功`,
      expectComponent &&
        state.text.includes(item.expectText) &&
        state.text.length >= item.minLength &&
        consoleErrors.length === errorsBefore,
      `正文 ${state.text.length} 字符，prose=${state.hasProse}，comingSoon=${state.hasComingSoon}，新增报错=${consoleErrors.length - errorsBefore}`,
    )
    if (item.path === '/about') {
      check('关于本站使用正文排版（.prose-article）', state.hasProse)
    } else {
      check(`${item.name} 使用「即将上线」占位组件`, state.hasComingSoon)
    }
  }

  // ---------------------------------------------------------------- 控制台与网络
  console.log('')
  console.log('[5] 控制台与网络')
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
