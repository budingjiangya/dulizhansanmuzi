/**
 * 运维辅助脚本：清空本站 Redis 缓存键（首页列表、站点配置等）
 * 场景：站点配置或演示数据变更后，希望前台立即生效而不等待 TTL 到期。
 *
 * 用法：pnpm --filter @sanmuzi/backend cache:flush
 *      pnpm --filter @sanmuzi/backend cache:flush -- --dry-run   # 只列出键，不删除
 */
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { config as loadEnv } from 'dotenv'
import Redis from 'ioredis'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const envPath = resolve(scriptDir, '..', '.env')

if (existsSync(envPath)) {
  loadEnv({ path: envPath, override: true })
  console.log(`[cache] 已加载 ${envPath}`)
}

const redisUrl = process.env.REDIS_URL
if (!redisUrl) {
  console.error('[cache] 缺少 REDIS_URL 环境变量')
  process.exit(1)
}

const keyPrefix = process.env.REDIS_KEY_PREFIX ?? ''
const dryRun = process.argv.includes('--dry-run')

async function main(): Promise<void> {
  const redis = new Redis(redisUrl, { lazyConnect: true, maxRetriesPerRequest: 2 })
  try {
    await redis.connect()
    const pattern = `${keyPrefix}*`
    const keys: string[] = []
    let cursor = '0'
    do {
      const [next, batch] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 200)
      cursor = next
      keys.push(...batch)
    } while (cursor !== '0')

    if (keys.length === 0) {
      console.log(`[cache] 没有匹配 ${pattern} 的键`)
      return
    }

    if (dryRun) {
      console.log(`[cache] 命中 ${keys.length} 个键（dry-run，不删除）：`)
      keys.forEach((key) => console.log(`  - ${key}`))
      return
    }

    const removed = await redis.del(...keys)
    console.log(`[cache] 已删除 ${removed} 个键（前缀 ${keyPrefix || '(无)'}）`)
  } finally {
    redis.disconnect()
  }
}

main().catch((error: unknown) => {
  console.error(`[cache] 执行失败：${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
})
