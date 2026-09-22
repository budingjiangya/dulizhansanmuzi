/**
 * Redis 服务
 * 设计原则（可靠性优先）：
 * 1. 使用 ioredis，`lazyConnect` + 有限重试，连接失败时把 available 置为 false 并打印告警；
 * 2. **绝不因为 Redis 不可用而让进程崩溃**：所有读写方法内部捕获异常并降级
 *    （缓存读返回 null、写忽略；限流放行；分片会话回退到本地文件系统）；
 * 3. 提供业务级封装：缓存读写、按前缀清理、计数器与 TTL，避免业务层直接拼 key。
 */
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import Redis, { type RedisOptions } from 'ioredis'
import type { AppConfiguration } from '../config/configuration'

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name)
  /** ioredis 客户端（连接失败时依然存在实例，但 available 为 false） */
  private readonly client: Redis
  /** key 统一前缀 */
  private readonly prefix: string
  /** 是否可用（连接成功且无致命错误） */
  private available = false
  /** 是否已关闭 */
  private closed = false

  constructor(private readonly configService: ConfigService<AppConfiguration, true>) {
    const url = this.configService.get('redisUrl', { infer: true })
    this.prefix = this.configService.get('redisKeyPrefix', { infer: true })

    const options: RedisOptions = {
      lazyConnect: true,
      // 最多重试 5 次，间隔封顶 3 秒，避免 Redis 挂掉时无限重连刷屏
      retryStrategy: (times: number) => (times > 5 ? null : Math.min(times * 300, 3000)),
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      connectTimeout: 3000,
      keepAlive: 10_000,
    }

    this.client = url
      ? new Redis(url, options)
      : new Redis({ host: '127.0.0.1', port: 6379, ...options })

    this.registerEvents()
  }

  /** 注册连接事件：只记录日志，不抛出、不退出进程 */
  private registerEvents(): void {
    this.client.on('ready', () => {
      this.available = true
      this.logger.log('Redis 连接成功，缓存与登录限流已启用')
    })
    this.client.on('error', (error: Error) => {
      if (this.available) {
        this.logger.warn(`Redis 连接异常，已降级为「无缓存/无限流」：${error.message}`)
      }
      this.available = false
    })
    this.client.on('end', () => {
      if (this.available) this.logger.warn('Redis 连接已断开，已降级为「无缓存/无限流」')
      this.available = false
    })
  }

  /** 启动时尝试连接（失败仅告警） */
  async onModuleInit(): Promise<void> {
    try {
      await this.client.connect()
      // lazyConnect 下 connect() 成功即视为可用；PING 再确认一次
      const pong = await this.client.ping()
      this.available = pong === 'PONG'
      if (!this.available) this.logger.warn('Redis PING 未返回 PONG，已降级为「无缓存/无限流」')
    } catch (error) {
      this.available = false
      this.logger.warn(
        `Redis 连接失败，已降级为「无缓存/无限流」（登录限流跳过、首页缓存关闭、分片会话落盘）：${
          error instanceof Error ? error.message : String(error)
        }`,
      )
    }
  }

  /** 应用关闭时断开连接 */
  async onModuleDestroy(): Promise<void> {
    this.closed = true
    try {
      await this.client.quit()
    } catch {
      this.client.disconnect()
    }
  }

  /** 当前是否可用（业务层可据此选择降级分支） */
  isAvailable(): boolean {
    return this.available && !this.closed
  }

  /** 拼接带前缀的完整 key */
  buildKey(key: string): string {
    return `${this.prefix}${key}`
  }

  /** 读取缓存（不可用或不存在返回 null） */
  async getJson<T>(key: string): Promise<T | null> {
    if (!this.isAvailable()) return null
    try {
      const raw = await this.client.get(this.buildKey(key))
      if (!raw) return null
      return JSON.parse(raw) as T
    } catch (error) {
      this.logger.warn(`读取缓存失败（已忽略）：${this.describe(error)}`)
      return null
    }
  }

  /** 写入缓存（seconds <= 0 表示不缓存） */
  async setJson(key: string, value: unknown, seconds: number): Promise<void> {
    if (!this.isAvailable() || seconds <= 0) return
    try {
      await this.client.set(this.buildKey(key), JSON.stringify(value), 'EX', Math.floor(seconds))
    } catch (error) {
      this.logger.warn(`写入缓存失败（已忽略）：${this.describe(error)}`)
    }
  }

  /** 读取字符串 */
  async getString(key: string): Promise<string | null> {
    if (!this.isAvailable()) return null
    try {
      return await this.client.get(this.buildKey(key))
    } catch (error) {
      this.logger.warn(`读取缓存失败（已忽略）：${this.describe(error)}`)
      return null
    }
  }

  /** 写入字符串 */
  async setString(key: string, value: string, seconds?: number): Promise<void> {
    if (!this.isAvailable()) return
    try {
      const fullKey = this.buildKey(key)
      if (seconds && seconds > 0) {
        await this.client.set(fullKey, value, 'EX', Math.floor(seconds))
      } else {
        await this.client.set(fullKey, value)
      }
    } catch (error) {
      this.logger.warn(`写入缓存失败（已忽略）：${this.describe(error)}`)
    }
  }

  /** 删除单个 key */
  async del(...keys: string[]): Promise<void> {
    if (!this.isAvailable() || keys.length === 0) return
    try {
      await this.client.del(...keys.map((key) => this.buildKey(key)))
    } catch (error) {
      this.logger.warn(`删除缓存失败（已忽略）：${this.describe(error)}`)
    }
  }

  /**
   * 按前缀批量删除（使用 SCAN，避免 KEYS 阻塞 Redis）
   * 注意：分片上传场景下同一前缀会有多个 key，这里统一清理。
   */
  async delByPrefix(prefixKey: string): Promise<number> {
    if (!this.isAvailable()) return 0
    const pattern = `${this.buildKey(prefixKey)}*`
    let deleted = 0
    try {
      let cursor = '0'
      do {
        const [next, keys] = await this.client.scan(cursor, 'MATCH', pattern, 'COUNT', 200)
        cursor = next
        if (keys.length > 0) {
          deleted += await this.client.del(...keys)
        }
      } while (cursor !== '0')
    } catch (error) {
      this.logger.warn(`按前缀清理缓存失败（已忽略）：${this.describe(error)}`)
    }
    return deleted
  }

  /** 计数器自增并设置过期（首次自增时设置），返回自增后的值；Redis 不可用返回 null */
  async increase(key: string, ttlSeconds: number): Promise<number | null> {
    if (!this.isAvailable()) return null
    try {
      const fullKey = this.buildKey(key)
      const value = await this.client.incr(fullKey)
      if (value === 1 && ttlSeconds > 0) {
        await this.client.expire(fullKey, Math.floor(ttlSeconds))
      }
      return value
    } catch (error) {
      this.logger.warn(`计数器操作失败（已忽略）：${this.describe(error)}`)
      return null
    }
  }

  /** 剩余 TTL（秒），不存在返回 -2，不可用返回 null */
  async ttl(key: string): Promise<number | null> {
    if (!this.isAvailable()) return null
    try {
      return await this.client.ttl(this.buildKey(key))
    } catch (error) {
      this.logger.warn(`读取 TTL 失败（已忽略）：${this.describe(error)}`)
      return null
    }
  }

  /** 集合：追加成员（分片序号记录用） */
  async addToSet(key: string, ...members: string[]): Promise<void> {
    if (!this.isAvailable() || members.length === 0) return
    try {
      await this.client.sadd(this.buildKey(key), ...members)
    } catch (error) {
      this.logger.warn(`写入集合失败（已忽略）：${this.describe(error)}`)
    }
  }

  /** 集合：读取全部成员 */
  async getSetMembers(key: string): Promise<string[]> {
    if (!this.isAvailable()) return []
    try {
      return await this.client.smembers(this.buildKey(key))
    } catch (error) {
      this.logger.warn(`读取集合失败（已忽略）：${this.describe(error)}`)
      return []
    }
  }

  /** 统一异常描述 */
  private describe(error: unknown): string {
    return error instanceof Error ? error.message : String(error)
  }
}
