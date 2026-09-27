/**
 * 访客端 UI 渲染验证（无头 Chrome + Puppeteer）
 *
 * 目的：与 verify-admin-ui.mjs 同规格地验证访客端真实渲染，
 * 而不只依赖「HTTP 200」。覆盖首页卡片列表、封面图加载、文章详情排版与控制台报错。
 *
 * 用法：node scripts/verify-portal-ui.mjs [--url=http://localhost:5173] [--out=scripts/artifacts]
 *
 * 断言重点（对应真实交互约束）：
 * 1. 首页卡片数量与接口返回的推荐文章数一致
 * 2. 每张卡片的封面图都真实加载成功（naturalWidth > 0，排除 404/白图）
 * 3. 视频型卡片默认渲染的是静态抽帧帧，且首页不预加载任何 <video>（性能约束）
 * 4. 点击卡片能进入文章详情页并渲染富文本正文
 * 5. 无控制台错误、无失败请求
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
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--window-size=1440,1200'],
  defaultViewport: { width: 1440, height: 1200 },
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
  console.log(` 访客端 UI 渲染验证  base=${BASE_URL}`)
  console.log('============================================================')

  // ---------------------------------------------------------------- 首页
  console.log('')
  console.log('[1] 首页推荐列表')
  await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle2', timeout: 60000 })
  await page.waitForSelector('[data-testid="blog-card"]', { timeout: 30000 })
  // 等封面图（含远程占位图）加载完
  await sleep(3000)
  await page.screenshot({ path: resolve(OUT_DIR, 'portal-01-home.png'), fullPage: true })

  const apiExpected = await page.evaluate(async () => {
    const response = await fetch('/api/portal/articles?page=1&pageSize=9')
    const json = await response.json()
    return json.data.list.length
  })

  const home = await page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll('[data-testid="blog-card"]'))
    const images = cards.map((card) => {
      const img = card.querySelector('img')
      return {
        exists: Boolean(img),
        loaded: Boolean(img && img.complete && img.naturalWidth > 0),
        naturalWidth: img?.naturalWidth ?? 0,
        src: img?.getAttribute('src') ?? '',
      }
    })
    const videoTags = document.querySelectorAll('[data-testid="blog-card"] video')
    const headings = cards.map((card) => (card.querySelector('h2')?.textContent ?? '').trim())
    return {
      cardCount: cards.length,
      images,
      videoTagCount: videoTags.length,
      headings,
      firstCardTitle: headings[0],
      hasVisibleText: (document.body.innerText ?? '').length > 200,
    }
  })

  check('卡片数量与接口推荐数一致', home.cardCount === apiExpected && home.cardCount > 0, `卡片=${home.cardCount} / 接口=${apiExpected}`)
  check(
    '每张卡片都有封面图元素',
    home.images.length === home.cardCount && home.images.every((item) => item.exists),
    `图片元素=${home.images.filter((i) => i.exists).length}/${home.cardCount}`,
  )
  const loadedImages = home.images.filter((item) => item.loaded)
  check(
    '封面图全部真实加载成功（排除 404 / 白图）',
    loadedImages.length === home.images.length,
    `加载成功=${loadedImages.length}/${home.images.length}` +
      (home.images.length - loadedImages.length
        ? `，失败源=${home.images.filter((i) => !i.loaded).map((i) => i.src.slice(0, 60)).join(' | ')}`
        : ''),
  )
  check(
    '首页未预加载任何 video 元素（性能约束）',
    home.videoTagCount === 0,
    `video 标签数=${home.videoTagCount}`,
  )
  check('卡片标题非空且页面有正文', home.hasVisibleText && home.headings.every((title) => title.length > 0), `首篇=「${home.firstCardTitle}」`)

  // ---------------------------------------------------------------- 多图 hover 轮播
  console.log('')
  console.log('[2] 多图卡片 hover 轮播（真实鼠标事件）')

  /*
   * 用 ElementHandle.hover()，而不是「scrollIntoView + 手算坐标」：
   * 本站启用了 CSS `scroll-behavior: smooth`，scrollIntoView 之后立刻取 rect 拿到的是
   * 滚动前的旧坐标，鼠标可能落在卡片之外 —— 会造成 hover 类断言的假失败。
   * hover() 内部会先滚动到可视区域再移动到元素中心，可靠得多。
   */
  const cardHandles = await page.$$('[data-testid="blog-card"]')
  const cardLabels = []
  for (const handle of cardHandles) {
    cardLabels.push(
      await handle.evaluate(
        (el) => (el.querySelector('[data-testid="card-cover-label"]')?.textContent ?? '').trim(),
      ),
    )
  }
  const imageCardIndex = cardLabels.findIndex((text) => text.includes('图'))
  const videoCardIndex = cardLabels.findIndex((text) => text.includes('视频'))
  check(
    '识别出图像型与视频型卡片',
    imageCardIndex >= 0 && videoCardIndex >= 0,
    `封面标签=${cardLabels.join(' / ')}`,
  )

  if (imageCardIndex >= 0) {
    const imageCard = cardHandles[imageCardIndex]
    const readSrc = () => imageCard.evaluate((el) => el.querySelector('img')?.getAttribute('src') ?? '')
    const srcBefore = await readSrc()
    await imageCard.hover()
    await sleep(2600)
    const srcDuring = await readSrc()
    await page.mouse.move(5, 5)
    await sleep(1200)
    const srcAfter = await readSrc()
    check(
      '多图卡片 hover 时封面发生切换',
      srcDuring !== srcBefore,
      `hover 前=${srcBefore.slice(-28)} → hover 后=${srcDuring.slice(-28)}`,
    )
    check('鼠标移开后回到第一张封面', srcAfter === srcBefore, `移开后=${srcAfter.slice(-28)}`)
  } else {
    check('找到多图模式卡片', false, '首页没有 coverType=image 的卡片，无法验证轮播')
  }

  // ---------------------------------------------------------------- 视频 hover 预览
  console.log('')
  console.log('[3] 视频卡片 hover 静音预览（真实鼠标事件）')
  if (videoCardIndex >= 0) {
    const videoCard = cardHandles[videoCardIndex]
    await videoCard.hover()
    await sleep(3000)
    const hoverState = await videoCard.evaluate((el) => {
      const video = el.querySelector('video')
      return {
        videoMounted: Boolean(video),
        muted: video?.muted ?? null,
        paused: video?.paused ?? null,
        currentTime: video?.currentTime ?? 0,
        src: video?.getAttribute('src') ?? '',
      }
    })
    check('hover 后挂载了 video 元素', hoverState.videoMounted, `src=${hoverState.src.slice(-40)}`)
    check('视频为静音（muted）', hoverState.muted === true, `muted=${hoverState.muted}`)
    check(
      '视频正在播放（已开始解码）',
      hoverState.paused === false || hoverState.currentTime > 0,
      `paused=${hoverState.paused} currentTime=${hoverState.currentTime.toFixed(2)}`,
    )

    await page.mouse.move(5, 5)
    await sleep(1500)
    const leaveState = await videoCard.evaluate((el) => ({
      videoMounted: Boolean(el.querySelector('video')),
      hasStaticFrame: Boolean(el.querySelector('img')),
    }))
    check(
      '移开后卸载 video 并保留静态帧',
      !leaveState.videoMounted && leaveState.hasStaticFrame,
      `video 仍在=${leaveState.videoMounted}`,
    )
  } else {
    check('找到视频模式卡片', false, '首页没有 coverType=video 的卡片，无法验证悬浮预览')
  }

  // ---------------------------------------------------------------- 详情页
  console.log('')
  console.log('[4] 文章详情页')
  const detailErrorsBefore = consoleErrors.length
  await page.evaluate(() => {
    document.querySelector('[data-testid="blog-card"] a')?.click()
  })
  await page.waitForFunction(() => location.pathname.startsWith('/article/'), { timeout: 20000 })
  await sleep(2500)
  await page.screenshot({ path: resolve(OUT_DIR, 'portal-02-article.png'), fullPage: false })

  const detail = await page.evaluate(() => {
    const body = document.querySelector('.prose-article')
    return {
      path: location.pathname,
      // 用 data-testid 精确定位文章标题：页面里还有页头的站点名 <h1>，
      // 直接取第一个 h1 会拿到站点名，导致这条断言「假通过」
      title: (document.querySelector('[data-testid="article-title"]')?.textContent ?? '').trim(),
      hasProse: Boolean(body),
      proseTextLength: (body?.innerText ?? '').replace(/\u200b/g, '').trim().length,
      h2Count: body?.querySelectorAll('h2').length ?? 0,
      imgCount: body?.querySelectorAll('img').length ?? 0,
      titleText: document.title,
      apiTitle: null,
    }
  })
  const apiTitle = await page.evaluate(async () => {
    const id = location.pathname.split('/').pop()
    const response = await fetch(`/api/portal/articles/${id}`)
    const json = await response.json()
    return json.data?.title ?? ''
  })
  check('卡片点击跳转到详情页', detail.path.startsWith('/article/'), `path=${detail.path}`)
  check('详情页标题与接口数据一致', detail.title.length > 0 && detail.title === apiTitle, `页面=「${detail.title}」/ 接口=「${apiTitle}」`)
  check('富文本正文渲染成功', detail.hasProse && detail.proseTextLength > 50, `正文 ${detail.proseTextLength} 字符，h2=${detail.h2Count}，img=${detail.imgCount}`)
  check('详情页无新增控制台错误', consoleErrors.length === detailErrorsBefore, `新增=${consoleErrors.length - detailErrorsBefore}`)

  // ---------------------------------------------------------------- 404
  console.log('')
  console.log('[5] 404 页面')
  await page.goto(`${BASE_URL}/not-found`, { waitUntil: 'networkidle2' })
  await sleep(1000)
  const notFound = await page.evaluate(() => ({
    text: (document.body.innerText ?? '').replace(/\s+/g, ' ').slice(0, 80),
  }))
  check('访客端 404 页面渲染', notFound.text.includes('404') || notFound.text.includes('没有内容'), `文本="${notFound.text}"`)

  // ---------------------------------------------------------------- 控制台与网络
  console.log('')
  console.log('[6] 控制台与网络')
  const realErrors = consoleErrors.filter((text) => !text.includes('favicon'))
  const nonFaviconFailures = failedRequests.filter((item) => !item.includes('favicon'))
  /*
   * 两类「主动中止」是设计使然，不计为资源故障：
   * 1. 多图轮播每 900ms 切换一次 <img src>，未加载完的旧图请求会被浏览器中止；
   * 2. 鼠标移开视频卡片时组件卸载 <video> 释放解码资源，视频请求被中止。
   *
   * 判据用 ERR_ABORTED 本身：它按定义表示「浏览器主动取消」，请求未拿到任何响应，
   * 因此不可能代表资源损坏（404/500/DNS/连接失败 都是别的错误码）。
   * 明细会原样打印，不做隐藏。
   */
  const intentionalAborts = nonFaviconFailures.filter((item) => item.includes('ERR_ABORTED'))
  const realFailed = nonFaviconFailures.filter((item) => !item.includes('ERR_ABORTED'))

  check('无控制台错误', realErrors.length === 0, realErrors.slice(0, 3).join(' | '))
  check('无失败请求（排除 favicon）', realFailed.length === 0, realFailed.slice(0, 3).join(' | '))
  if (intentionalAborts.length) {
    console.log(`        说明：${intentionalAborts.length} 个请求被主动中止（轮播切换封面 / 视频卸载释放解码资源），属预期行为：`)
    intentionalAborts.slice(0, 4).forEach((item) => console.log(`          · ${item.slice(0, 110)}`))
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
