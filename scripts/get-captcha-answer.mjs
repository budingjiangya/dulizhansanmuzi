/**
 * 测试辅助：读取图形验证码的正确答案
 *
 * 为什么需要它：
 * 验证码答案只存在服务端 Redis 里，接口不会返回，因此烟测与 UI 验证无法完成
 * 「用正确验证码提交成功」这条路径。本脚本用与后端相同的 .env 连 Redis 只读答案，
 * 仅用于本地验证，**不是产品接口**，也不会被后端加载。
 *
 * 用法：
 *   node scripts/get-captcha-answer.mjs <captchaId>
 *   node scripts/get-captcha-answer.mjs <captchaId> --json   # 输出 {"answer":"abcd"}
 */
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { config as loadEnv } from 'dotenv'
import Redis from 'ioredis'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const rootDir = resolve(scriptDir, '..')
const envPath = resolve(rootDir, 'backend-nest', '.env')

if (!existsSync(envPath)) {
  console.error(`[captcha] 找不到 ${envPath}`)
  process.exit(1)
}
loadEnv({ path: envPath, override: true })

const captchaId = process.argv[2]
const asJson = process.argv.includes('--json')

if (!captchaId) {
  console.error('[captcha] 用法：node scripts/get-captcha-answer.mjs <captchaId>')
  process.exit(1)
}

const redisUrl = process.env.REDIS_URL
const prefix = process.env.REDIS_KEY_PREFIX ?? ''
if (!redisUrl) {
  console.error('[captcha] .env 缺少 REDIS_URL')
  process.exit(1)
}

const key = `${prefix}captcha:${captchaId}`

const redis = new Redis(redisUrl, { lazyConnect: true, maxRetriesPerRequest: 2 })
try {
  await redis.connect()
  const answer = await redis.get(key)
  if (answer === null) {
    console.error(`[captcha] ${key} 不存在或已过期`)
    process.exit(2)
  }
  if (asJson) console.log(JSON.stringify({ answer }))
  else console.log(answer)
} catch (error) {
  console.error(`[captcha] 读取失败：${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
} finally {
  redis.disconnect()
}
