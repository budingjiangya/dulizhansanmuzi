/**
 * 测试辅助：清除邮件订阅的 IP 限流计数
 *
 * 为什么需要它：
 * 限流按「同一 IP 每小时最多 5 次」计数。验证脚本要断言第 6 次返回 42900，
 * 但跑完之后该 IP 会被锁一小时，后续任何「提交成功」的断言都会失败，
 * 连重复运行烟测都会失败。因此验证脚本必须在断言前后各清一次计数。
 *
 * 仅用于本地验证，不是产品接口。
 *
 * 用法：
 *   node scripts/reset-subscribe-rate.mjs <ip>
 *   node scripts/reset-subscribe-rate.mjs 127.0.0.1
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
  console.error(`[rate] 找不到 ${envPath}`)
  process.exit(1)
}
loadEnv({ path: envPath, override: true })

const ip = process.argv[2]
if (!ip) {
  console.error('[rate] 用法：node scripts/reset-subscribe-rate.mjs <ip>')
  process.exit(1)
}

const redisUrl = process.env.REDIS_URL
const prefix = process.env.REDIS_KEY_PREFIX ?? ''
if (!redisUrl) {
  console.error('[rate] .env 缺少 REDIS_URL')
  process.exit(1)
}

const key = `${prefix}subscribe:rate:${ip}`

const redis = new Redis(redisUrl, { lazyConnect: true, maxRetriesPerRequest: 2 })
try {
  await redis.connect()
  const removed = await redis.del(key)
  console.log(`[rate] 已清除 ${key}（删除 ${removed} 个键）`)
} catch (error) {
  console.error(`[rate] 清除失败：${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
} finally {
  redis.disconnect()
}
