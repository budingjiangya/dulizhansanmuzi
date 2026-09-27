/**
 * 邮件订阅服务
 * 职责：
 * 1. 图形验证码签发：答案只落 Redis（key = captcha:<captchaId>，TTL 120 秒，小写），返回图片 data URI；
 * 2. 前台订阅提交，处理顺序固定为「校验验证码 -> 限流 -> 规范化邮箱 -> 判重」；
 * 3. 后台分页查询与删除。
 *
 * Redis 降级取舍：
 * - 验证码与限流都依赖 Redis，Redis 不可用时 RedisService 只会返回 null；
 *   验证码按「校验失败」处理（40000，宁可不放过也不放行伪造请求），限流则降级放行并告警。
 */
import { Injectable, Logger } from '@nestjs/common'
import { randomUUID } from 'node:crypto'
import type { CaptchaVo, PageResult, SubscribeResultVo, SubscriptionVo } from '@sanmuzi/contracts'
import { CAPTCHA_KEY, SUBSCRIBE_RATE_KEY } from '../../common/constants/cache.constants'
import { BizException } from '../../common/exceptions/biz.exception'
import { formatDateTime } from '../../common/utils/admin-user.util'
import { generateCaptcha } from '../../common/utils/captcha.util'
import { buildPageResult, normalizePaging, parseTimeInput } from '../../common/utils/pagination.util'
import { PrismaService } from '../../prisma/prisma.service'
import { RedisService } from '../../redis/redis.service'
import type { QuerySubscriptionDto } from './dto/query-subscription.dto'
import type { SubscribeDto } from './dto/subscribe.dto'

/** 验证码有效期（秒） */
const CAPTCHA_TTL_SECONDS = 120

/** 同一 IP 的限流窗口（秒）与窗口内最多提交次数 */
const SUBSCRIBE_RATE_WINDOW_SECONDS = 3600
const SUBSCRIBE_RATE_MAX = 5

/** 落库字段长度上限（与 prisma schema 的列长度一致），超长直接截断，避免脏请求头导致写库失败 */
const SOURCE_IP_MAX_LENGTH = 128
const USER_AGENT_MAX_LENGTH = 512

/** 订阅记录原始行（只声明映射用到的字段，不直接依赖 Prisma 生成类型） */
interface SubscriptionRow {
  id: number
  email: string
  message: string | null
  sourceIp: string
  userAgent: string | null
  status: number
  createdAt: Date
}

@Injectable()
export class SubscriptionService {
  private readonly logger = new Logger(SubscriptionService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  /** 签发图形验证码：只返回标识与图片，答案留在服务端 Redis，前端拿不到明文答案 */
  async createCaptcha(): Promise<CaptchaVo> {
    const { text, imageBase64 } = generateCaptcha()
    const captchaId = randomUUID()
    await this.redis.setString(this.captchaKey(captchaId), text.toLowerCase(), CAPTCHA_TTL_SECONDS)
    return { captchaId, imageBase64 }
  }

  /**
   * 前台提交订阅
   * 顺序：校验验证码 -> 限流 -> 规范化邮箱 -> 判重。
   * 已订阅过的邮箱返回 duplicated=true，**不新建记录**；响应不返回订阅记录明细。
   */
  async subscribe(dto: SubscribeDto, ip: string, userAgent?: string): Promise<SubscribeResultVo> {
    await this.verifyCaptcha(dto.captchaId, dto.captchaCode)
    await this.checkRateLimit(ip)

    const email = this.normalizeEmail(dto.email)
    const existed = await this.prisma.blogSubscription.findUnique({ where: { email }, select: { id: true } })
    if (existed) {
      this.logger.log(`邮箱已订阅，跳过新建（id=${existed.id}）`)
      return { duplicated: true }
    }

    await this.prisma.blogSubscription.create({
      data: {
        email,
        message: this.normalizeMessage(dto.message),
        sourceIp: this.truncate(ip, SOURCE_IP_MAX_LENGTH),
        userAgent: this.normalizeUserAgent(userAgent),
      },
    })
    this.logger.log(`新增邮件订阅：${email}`)
    return { duplicated: false }
  }

  /** 后台分页查询：邮箱模糊 + 提交时间区间，按 createdAt desc */
  async listSubscriptions(query: QuerySubscriptionDto): Promise<PageResult<SubscriptionVo>> {
    const { page, pageSize, skip, take } = normalizePaging(query.page, query.pageSize)

    // 库内邮箱统一为小写，查询值也转小写，避免依赖数据库排序规则的大小写敏感性
    const email = query.email?.trim().toLowerCase()
    const start = parseTimeInput(query.startTime)
    const end = parseTimeInput(query.endTime)

    const where = {
      ...(email ? { email: { contains: email } } : {}),
      ...(start || end
        ? {
            createdAt: {
              ...(start ? { gte: start } : {}),
              ...(end ? { lte: end } : {}),
            },
          }
        : {}),
    }

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.blogSubscription.count({ where }),
      this.prisma.blogSubscription.findMany({
        where,
        skip,
        take,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      }),
    ])

    return buildPageResult(
      rows.map((row) => this.mapSubscription(row)),
      total,
      page,
      pageSize,
    )
  }

  /** 后台删除订阅记录；不存在抛 40400 */
  async removeSubscription(id: number): Promise<null> {
    const existed = await this.prisma.blogSubscription.findUnique({ where: { id }, select: { id: true } })
    if (!existed) throw BizException.notFound('订阅记录不存在')

    await this.prisma.blogSubscription.delete({ where: { id } })
    this.logger.log(`删除邮件订阅记录（id=${id}）`)
    return null
  }

  /** 验证码 Redis key：captcha:<captchaId> */
  private captchaKey(captchaId: string): string {
    return `${CAPTCHA_KEY}:${captchaId}`
  }

  /**
   * 校验图形验证码
   * 一次性语义：先取值，随后**无论对错都立即删除**，防止同一个验证码被反复尝试（撞库/爆破）。
   */
  private async verifyCaptcha(captchaId: string, captchaCode: string): Promise<void> {
    if (!this.redis.isAvailable()) {
      this.logger.warn('Redis 不可用，无法校验图形验证码，本次提交按 40000 拒绝')
    }

    const key = this.captchaKey(captchaId)
    const expected = await this.redis.getString(key)
    await this.redis.del(key)

    if (!expected || expected !== captchaCode.trim().toLowerCase()) {
      throw BizException.paramInvalid('验证码错误或已过期')
    }
  }

  /**
   * 提交限流：同一 IP 一小时最多 5 次
   * RedisService.increase 内部保证「首次自增时设置过期」；Redis 不可用时返回 null，此处降级放行并告警。
   */
  private async checkRateLimit(ip: string): Promise<void> {
    const count = await this.redis.increase(`${SUBSCRIBE_RATE_KEY}:${ip}`, SUBSCRIBE_RATE_WINDOW_SECONDS)
    if (count === null) {
      this.logger.warn(`Redis 不可用，已跳过订阅提交限流计数（IP：${ip}）`)
      return
    }
    if (count > SUBSCRIBE_RATE_MAX) {
      throw BizException.tooManyRequests('提交过于频繁，请稍后再试')
    }
  }

  /** 邮箱规范化：trim + 小写（判重与落库共用同一结果） */
  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase()
  }

  /** 留言规范化：trim；空串按未填写处理，落库为 null */
  private normalizeMessage(message?: string): string | null {
    const trimmed = message?.trim()
    return trimmed ? trimmed : null
  }

  /** UA 规范化：trim + 截断到列长度，空值落库为 null */
  private normalizeUserAgent(userAgent?: string): string | null {
    const trimmed = userAgent?.trim()
    if (!trimmed) return null
    return this.truncate(trimmed, USER_AGENT_MAX_LENGTH)
  }

  /** 按数据库列长度截断 */
  private truncate(value: string, maxLength: number): string {
    return value.length > maxLength ? value.slice(0, maxLength) : value
  }

  /** 数据库记录 -> 契约 SubscriptionVo（时间统一为 yyyy-MM-dd HH:mm:ss 字符串） */
  private mapSubscription(row: SubscriptionRow): SubscriptionVo {
    return {
      id: row.id,
      email: row.email,
      message: row.message,
      sourceIp: row.sourceIp,
      userAgent: row.userAgent,
      status: row.status,
      createdAt: formatDateTime(row.createdAt) ?? '',
    }
  }
}
