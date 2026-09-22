/**
 * 后台 UI 渲染验证（无头 Chrome + Puppeteer）
 *
 * 目的：不只依赖构建通过，而是真正渲染页面并断言布局与接口数据，同时收集控制台报错与失败请求。
 * 用法：node scripts/verify-admin-ui.mjs [--url=http://localhost:5174] [--out=scripts/artifacts]
 *
 * 断言重点（对应曾经出现的真实缺陷）：
 * 1. 顶栏不得与侧边栏重叠（顶栏 left 必须 >= 侧边栏 right）
 * 2. 侧边栏必须撑满视口高度
 * 3. 卡片必须有可见背景色（Naive UI 主题必须生效）
 * 4. 趋势图必须横向排布，且存在可见高度的柱子
 * 5. 账号信息不得把页签栏挤成竖排（页签栏高度必须合理）
 */
import { mkdirSync, existsSync } from 'node:fs'
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

const BASE_URL = readArg('url', 'http://localhost:5174').replace(/\/+$/, '')
const OUT_DIR = resolve(rootDir, readArg('out', 'scripts/artifacts'))
const ADMIN_PATH = readArg('adminPath', '/')

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
  const tag = passed ? 'PASS' : 'FAIL'
  console.log(`  [${tag}] ${name}${detail ? ` — ${detail}` : ''}`)
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const browser = await puppeteer.launch({
  executablePath: chromePath,
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--window-size=1600,1000'],
  defaultViewport: { width: 1600, height: 1000 },
})

try {
  const page = await browser.newPage()
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text())
  })
  page.on('pageerror', (error) => consoleErrors.push(`pageerror: ${error.message}`))
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
  console.log(` 后台 UI 渲染验证  base=${BASE_URL}${ADMIN_PATH}`)
  console.log('============================================================')

  // ---------------------------------------------------------------- 登录页
  console.log('')
  console.log('[1] 登录页')
  await page.goto(`${BASE_URL}${ADMIN_PATH === '/' ? '/login' : `${ADMIN_PATH}/login`}`, {
    waitUntil: 'networkidle2',
    timeout: 60000,
  })
  await page.waitForSelector('input', { timeout: 20000 })
  await sleep(600)
  await page.screenshot({ path: resolve(OUT_DIR, 'admin-01-login.png') })

  const loginLayout = await page.evaluate(() => {
    const inputs = Array.from(document.querySelectorAll('input'))
    const button = Array.from(document.querySelectorAll('button')).find((item) =>
      (item.textContent ?? '').includes('登录'),
    )
    const rect = (el) => (el ? el.getBoundingClientRect() : null)
    const form = button?.closest('form') ?? button?.parentElement ?? null
    return {
      inputCount: inputs.length,
      firstInputWidth: rect(inputs[0])?.width ?? 0,
      buttonVisible: Boolean(button && rect(button)?.height > 20),
      formWidth: rect(form)?.width ?? 0,
      viewportWidth: window.innerWidth,
      hasThemeToggle: Boolean(document.querySelector('button')),
    }
  })
  check('登录表单渲染出账号与密码输入框', loginLayout.inputCount >= 2, `input 数量 = ${loginLayout.inputCount}`)
  check('登录按钮可见', loginLayout.buttonVisible)
  check(
    '表单宽度受控（不超过视口 60%）',
    loginLayout.formWidth > 0 && loginLayout.formWidth <= loginLayout.viewportWidth * 0.6,
    `form=${Math.round(loginLayout.formWidth)}px / viewport=${loginLayout.viewportWidth}px`,
  )

  // ---------------------------------------------------------------- 登录
  console.log('')
  console.log('[2] 真实登录表单流程并进入工作台')

  // 用真实表单登录，而不是注入 localStorage：
  // 注入 token 会让 Pinia store 与 localStorage 状态脱节，无法验证真实的登录链路。
  await page.type('input[autocomplete="username"]', 'admin')
  await page.type('input[autocomplete="current-password"]', 'Admin@123456')
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 60000 }).catch(() => {}),
    page.evaluate(() => {
      const button = Array.from(document.querySelectorAll('button')).find((item) =>
        (item.textContent ?? '').trim().includes('登录'),
      )
      button?.click()
    }),
  ])
  await sleep(2000)

  const afterLogin = await page.evaluate(() => ({
    path: window.location.pathname,
    hasToken: Boolean(localStorage.getItem('sanmuzi-admin-token')),
  }))
  check('登录后跳转到后台工作台', afterLogin.path.startsWith('/admin') && !afterLogin.path.includes('login'), `path=${afterLogin.path}`)
  check('登录态已写入 localStorage', afterLogin.hasToken)

  await page.waitForSelector('.n-statistic', { timeout: 30000 }).catch(() => {})
  await sleep(1200)
  await page.screenshot({ path: resolve(OUT_DIR, 'admin-02-dashboard.png'), fullPage: true })

  const layout = await page.evaluate(() => {
    const rect = (selector) => {
      const el = document.querySelector(selector)
      if (!el) return null
      const box = el.getBoundingClientRect()
      return { left: box.left, right: box.right, top: box.top, bottom: box.bottom, width: box.width, height: box.height }
    }
    const sider = document.querySelector('.n-layout-sider')
    const header = document.querySelector('.n-layout-header')
    // 页签栏
    const tabsBar = document.querySelector('[data-testid="admin-tabs-bar"]')
    const card = document.querySelector('.n-card')
    const cardBg = card ? getComputedStyle(card).backgroundColor : ''
    const chart = document.querySelector('[data-testid="login-trend-chart"]')
    const columns = chart ? Array.from(chart.querySelectorAll('[data-testid="trend-column"]')) : []
    const bars = chart
      ? Array.from(chart.querySelectorAll('div[title]')).map((el) => {
          const box = el.getBoundingClientRect()
          return { width: box.width, height: box.height, left: box.left, top: box.top, title: el.getAttribute('title') }
        })
      : []
    return {
      sider: rect('.n-layout-sider'),
      header: rect('.n-layout-header'),
      tabsRow: tabsBar
        ? (() => {
            const box = tabsBar.getBoundingClientRect()
            return { left: box.left, top: box.top, width: box.width, height: box.height }
          })()
        : null,
      tabsText: tabsBar ? (tabsBar.textContent ?? '').trim() : '',
      menuText: (document.querySelector('.n-menu')?.textContent ?? '').trim(),
      accountText: (document.querySelector('.n-layout-header')?.textContent ?? '').trim(),
      cardBg,
      chartHeight: chart ? chart.getBoundingClientRect().height : 0,
      columnCount: columns.length,
      barCount: bars.length,
      bars,
      hasStatistic: Boolean(document.querySelector('.n-statistic')),
      bodyScrollWidth: document.body.scrollWidth,
      viewportWidth: window.innerWidth,
    }
  })

  if (layout.sider && layout.header) {
    check(
      '顶栏不与侧边栏重叠',
      layout.header.left >= layout.sider.right - 1,
      `header.left=${Math.round(layout.header.left)} sider.right=${Math.round(layout.sider.right)}`,
    )
  } else {
    check('侧边栏与顶栏都存在', false, '未找到 .n-layout-sider 或 .n-layout-header')
  }

  check(
    '侧边栏撑满视口高度',
    Boolean(layout.sider && layout.sider.height >= 900),
    layout.sider ? `height=${Math.round(layout.sider.height)}` : 'missing',
  )

  check(
    '卡片背景色生效（Naive UI 主题已注入）',
    /rgba?\(/.test(layout.cardBg) && !/rgba\(0, 0, 0, 0\)/.test(layout.cardBg),
    `card background = ${layout.cardBg || 'none'}`,
  )

  check('统计区块渲染成功', layout.hasStatistic)

  check(
    '登录态已同步到 store（菜单完整：工作台/内容运营/系统管理/修改密码）',
    ['工作台', '内容运营', '系统管理', '修改密码'].every((item) => layout.menuText.includes(item)),
    `菜单文本="${layout.menuText.replace(/\s+/g, ' ').slice(0, 80)}"`,
  )
  check(
    '顶栏显示当前账号姓名与角色',
    layout.accountText.includes('超级管理员'),
    `顶栏文本="${layout.accountText.replace(/\s+/g, ' ').slice(0, 80)}"`,
  )

  if (layout.tabsRow) {
    check(
      '页签栏为横向单行（高度合理且含页签名）',
      layout.tabsRow.height > 10 && layout.tabsRow.height < 90 && layout.tabsText.includes('工作台'),
      `height=${Math.round(layout.tabsRow.height)} text="${layout.tabsText}"`,
    )
    check(
      '页签栏位于内容区（不与侧边栏重叠）',
      Boolean(layout.sider) && layout.tabsRow.left >= layout.sider.right - 1,
      `tabs.left=${Math.round(layout.tabsRow.left)} sider.right=${Math.round(layout.sider?.right ?? 0)}`,
    )
  } else {
    check('页签栏存在', false, '未找到 [data-testid=admin-tabs-bar]')
  }

  const visibleBars = layout.bars.filter((bar) => bar.height > 2)
  check(
    '趋势图渲染出 7 个日期列',
    layout.columnCount === 7,
    `列数=${layout.columnCount}`,
  )
  check(
    '趋势图容器高度固定（不被压扁）',
    layout.chartHeight >= 150 && layout.chartHeight <= 240,
    `chart height=${Math.round(layout.chartHeight)}px`,
  )
  check(
    '趋势图柱子可见且高度不为零',
    layout.barCount >= 7 && visibleBars.length >= 7,
    `柱子数=${layout.barCount}，可见=${visibleBars.length}`,
  )
  check(
    '柱子宽度合理（不是被拉满的横条）',
    layout.bars.length > 0 && layout.bars.every((bar) => bar.width > 4 && bar.width < 200),
    layout.bars.length ? `宽度范围 ${Math.round(Math.min(...layout.bars.map((b) => b.width)))}-${Math.round(Math.max(...layout.bars.map((b) => b.width)))}px` : '无柱子',
  )
  if (layout.bars.length >= 2) {
    const spread = Math.max(...layout.bars.map((b) => b.left)) - Math.min(...layout.bars.map((b) => b.left))
    check('趋势图柱子横向铺开', spread > 200, `横向跨度=${Math.round(spread)}px`)
  }

  check(
    '页面无横向溢出',
    layout.bodyScrollWidth <= layout.viewportWidth + 2,
    `scrollWidth=${layout.bodyScrollWidth} viewport=${layout.viewportWidth}`,
  )

  // ---------------------------------------------------------------- 刷新保持登录态
  console.log('')
  console.log('[3] 硬刷新后登录态与菜单恢复')
  await page.goto(`${BASE_URL}${ADMIN_PATH}/dashboard`, { waitUntil: 'networkidle2', timeout: 60000 })
  await sleep(1800)
  const afterReload = await page.evaluate(() => ({
    accountText: (document.querySelector('.n-layout-header')?.textContent ?? '').trim(),
    menuText: (document.querySelector('.n-menu')?.textContent ?? '').trim(),
    path: window.location.pathname,
  }))
  check(
    '刷新后自动恢复用户信息（不是「未登录」）',
    afterReload.accountText.includes('超级管理员') && !afterReload.accountText.includes('未登录'),
    `顶栏="${afterReload.accountText.replace(/\s+/g, ' ').slice(0, 70)}"`,
  )
  check(
    '刷新后菜单按权限完整渲染',
    ['工作台', '内容运营', '系统管理', '修改密码'].every((item) => afterReload.menuText.includes(item)),
    `菜单="${afterReload.menuText.replace(/\s+/g, ' ').slice(0, 60)}"`,
  )

  // ---------------------------------------------------------------- 各菜单页
  console.log('')
  console.log('[4] 各功能页渲染与截图')
  const pages = [
    { name: '文章管理', path: '/blog/articles', wait: 'table' },
    { name: '新建文章', path: '/blog/articles/create', wait: 'textarea, .w-e-text-container, input' },
    { name: '账号管理', path: '/system/users', wait: 'table' },
    { name: '角色权限', path: '/system/roles', wait: 'table' },
    { name: '登录日志', path: '/system/login-logs', wait: 'table' },
    { name: '修改密码', path: '/profile/password', wait: 'input' },
  ]

  for (const item of pages) {
    const errorsBefore = consoleErrors.length
    const url = `${BASE_URL}${ADMIN_PATH === '/' ? '' : ADMIN_PATH}${item.path}`
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 })
    await page.waitForSelector(item.wait, { timeout: 25000 }).catch(() => {})
    await sleep(900)
    const file = `admin-0${4 + pages.indexOf(item)}-${item.path.replace(/\//g, '_').replace(/^_/, '')}.png`
    await page.screenshot({ path: resolve(OUT_DIR, file), fullPage: true })
    const info = await page.evaluate(() => ({
      title: document.title,
      text: (document.body.innerText ?? '').slice(0, 160).replace(/\s+/g, ' '),
      rows: document.querySelectorAll('tbody tr').length,
      hasError: (document.body.innerText ?? '').includes('无权访问该页面'),
    }))
    const newErrors = consoleErrors.length - errorsBefore
    check(
      `${item.name} 渲染正常`,
      !info.hasError && info.text.length > 10 && newErrors === 0,
      `rows=${info.rows} 新增报错=${newErrors} | ${info.text.slice(0, 60)}`,
    )
  }

  // ---------------------------------------------------------------- 控制台与请求
  console.log('')
  console.log('[5] 控制台与网络')
  const realFailedRequests = failedRequests.filter(
    (item) => !item.includes('favicon') && !item.includes('HTTP 401') && !item.includes('HTTP 403'),
  )
  const realErrors = consoleErrors.filter((text) => !text.includes('favicon') && !text.includes('404'))
  check('无控制台错误', realErrors.length === 0, realErrors.slice(0, 3).join(' | '))
  check('无失败请求（忽略 favicon）', realFailedRequests.length === 0, realFailedRequests.slice(0, 3).join(' | '))
} finally {
  await browser.close()
}

const failed = results.filter((item) => !item.passed)
console.log('')
console.log('============================================================')
if (failed.length === 0) {
  console.log(` 全部通过：${results.length}/${results.length}`)
} else {
  console.log(` 通过 ${results.length - failed.length} 项，失败 ${failed.length} 项`)
  failed.forEach((item) => console.log(`  - ${item.name} => ${item.detail}`))
}
console.log(` 截图目录：${OUT_DIR}`)
console.log('============================================================')
console.log('')

process.exit(failed.length === 0 ? 0 : 1)
