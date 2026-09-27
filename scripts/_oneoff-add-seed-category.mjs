/**
 * 一次性辅助脚本：给 seed.ts 的 6 篇演示文章插入 category 字段。
 * 按 sort 值定位（每篇 sort 唯一），避免依赖数组顺序。
 * 用法：node scripts/_oneoff-add-seed-category.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const seedPath = resolve(scriptDir, '..', 'backend-nest', 'prisma', 'seed.ts')

/** sort -> 分类名 */
const SORT_TO_CATEGORY = {
  60: '显示器',
  50: '音频',
  40: '家居',
  30: '影音',
  20: '桌面',
  10: '桌面',
}

let source = readFileSync(seedPath, 'utf8')
let inserted = 0

for (const [sort, category] of Object.entries(SORT_TO_CATEGORY)) {
  const anchor = `    sort: ${sort},\n`
  const replacement = `    sort: ${sort},\n    category: '${category}',\n`
  if (!source.includes(anchor)) {
    console.error(`未找到锚点：sort: ${sort} —— 已插入 ${inserted} 处，中止`)
    process.exit(1)
  }
  if (source.includes(replacement)) {
    console.log(`sort: ${sort} 已存在 category，跳过`)
    continue
  }
  source = source.replace(anchor, replacement)
  inserted += 1
}

writeFileSync(seedPath, source, 'utf8')
console.log(`完成：插入 ${inserted} 处 category 字段`)
