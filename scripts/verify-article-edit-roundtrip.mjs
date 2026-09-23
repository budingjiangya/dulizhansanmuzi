/**
 * 文章编辑页往返验证：打开编辑页 → 改标题 → 保存 → 重新读取确认落库。
 * 目的：确认富文本编辑器修复后，「加载正文 / 输入 / 保存」全链路没有内容损坏。
 *
 * 用法：node scripts/verify-article-edit-roundtrip.mjs
 */
import { existsSync } from 'node:fs'
import puppeteer from 'puppeteer-core'

const CHROME = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].find((item) => existsSync(item))

const BASE = 'http://localhost:5173'
const results = []
const errors = []

function check(name, passed, detail) {
  results.push({ name, passed, detail })
  console.log(`  [${passed ? 'PASS' : 'FAIL'}] ${name}${detail ? ` — ${detail}` : ''}`)
}

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--no-sandbox'],
  defaultViewport: { width: 1600, height: 1000 },
})

try {
  const page = await browser.newPage()
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text().slice(0, 200)}`)
  })

  console.log('')
  console.log('============================================================')
  console.log(' 文章编辑页往返验证')
  console.log('============================================================')
  console.log('')
  console.log('[1] 登录并打开文章编辑页')

  await page.goto(`${BASE}/admin/login`, { waitUntil: 'networkidle2' })
  await new Promise((r) => setTimeout(r, 1200))
  await page.type('input[autocomplete="username"]', 'admin')
  await page.type('input[autocomplete="current-password"]', 'Admin@123456')
  await page.evaluate(() => {
    Array.from(document.querySelectorAll('button'))
      .find((item) => (item.textContent ?? '').includes('登录'))
      ?.click()
  })
  await new Promise((r) => setTimeout(r, 2500))

  const token = await page.evaluate(() => localStorage.getItem('sanmuzi-admin-token'))
  const before = await page.evaluate(async (authToken) => {
    const response = await fetch('/api/admin/articles?page=1&pageSize=1', {
      headers: { Authorization: `Bearer ${authToken}` },
    })
    const json = await response.json()
    return json.data.list[0]
  }, token)
  const articleId = before.id
  const originalTitle = before.title
  const editedTitle = `${originalTitle}（往返验证）`

  await page.goto(`${BASE}/admin/blog/articles/${articleId}/edit`, { waitUntil: 'networkidle2' })
  await new Promise((r) => setTimeout(r, 3000))

  const loaded = await page.evaluate(() => ({
    editorText: (document.querySelector('.w-e-text-container')?.innerText ?? '').replace(/\u200b/g, '').trim(),
    h2Count: document.querySelectorAll('.w-e-text-container h2').length,
    imgCount: document.querySelectorAll('.w-e-text-container img').length,
    videoCount: document.querySelectorAll('.w-e-text-container video').length,
    title: document.querySelector('input')?.value ?? '',
  }))
  check('编辑页正文已加载', loaded.editorText.length > 50, `正文 ${loaded.editorText.length} 字符`)
  check('正文标题层级保留', loaded.h2Count >= 1, `h2 数量=${loaded.h2Count}`)
  check('正文图片保留', loaded.imgCount >= 1, `img 数量=${loaded.imgCount}`)
  check('编辑器未报错（无 slate 异常）', errors.length === 0, errors.slice(0, 2).join(' | '))

  console.log('')
  console.log('[2] 修改标题并保存')
  await page.evaluate(() => {
    const input = document.querySelector('input')
    if (input) {
      input.value = ''
      input.dispatchEvent(new Event('input', { bubbles: true }))
    }
  })
  await page.click('input')
  await page.keyboard.down('Control')
  await page.keyboard.press('KeyA')
  await page.keyboard.up('Control')
  await page.type('input', editedTitle)
  await new Promise((r) => setTimeout(r, 500))

  const saved = await page.evaluate(() => {
    const button = Array.from(document.querySelectorAll('button')).find((item) =>
      (item.textContent ?? '').trim().includes('保存修改'),
    )
    button?.click()
    return Boolean(button)
  })
  check('找到保存按钮并点击', saved)
  await new Promise((r) => setTimeout(r, 3000))

  const afterSavePath = await page.evaluate(() => location.pathname)
  check('保存后回到文章列表', afterSavePath.includes('/admin/blog/articles'), `path=${afterSavePath}`)

  const after = await page.evaluate(
    async (authToken, id) => {
      const response = await fetch(`/api/admin/articles/${id}`, {
        headers: { Authorization: `Bearer ${authToken}` },
      })
      const json = await response.json()
      return json.data
    },
    token,
    articleId,
  )
  check('标题已落库', after.title === editedTitle, `库中标题="${after.title}"`)
  check(
    '正文未丢失（保存后仍有 h2 与图片）',
    after.content.includes('<h2>') && after.content.includes('<img'),
    `正文长度=${after.content.length}`,
  )

  console.log('')
  console.log('[3] 还原标题')
  await page.evaluate(
    async (authToken, id, title) => {
      await fetch(`/api/admin/articles/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({ title }),
      })
    },
    token,
    articleId,
    originalTitle,
  )
  const restored = await page.evaluate(
    async (authToken, id) => {
      const response = await fetch(`/api/admin/articles/${id}`, {
        headers: { Authorization: `Bearer ${authToken}` },
      })
      const json = await response.json()
      return json.data.title
    },
    token,
    articleId,
  )
  check('标题已还原为原始值', restored === originalTitle, `标题="${restored}"`)
  check('全流程无控制台错误', errors.length === 0, errors.slice(0, 3).join(' | '))
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
console.log('============================================================')
console.log('')

process.exit(failed.length === 0 ? 0 : 1)
