/**
 * 鉴权服务
 * 职责：
 * 1. 账号密码登录（bcrypt 比对 + Redis 失败限流 + 登录日志落库）；
 * 2. 签发 JWT（payload 仅 userId / roleId）；
 * 3. 查询当前登录管理员信息（含实时权限）；
 * 4. 修改密码（校验旧密码后重新哈希）。
 * 所有业务规则都在服务层，controller 只做参数与响应编排。
 */
import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { JwtService } from '@nestjs/jwt'
import { LoginResult, type AdminUserInfo, type JwtPayload, type LoginVo } from '@sanmuzi/contracts'
import * as bcrypt from 'bcryptjs'
import type { Request } from 'express'
import type { AppConfiguration } from '../../config/configuration'
import { BizException } from '../../common/exceptions/biz.exception'
import { buildAdminUserInfo } from '../../common/utils/admin-user.util'
import { getClientIp } from '../../common/utils/ip.util'
import { PrismaService } from '../../prisma/prisma.service'
import { RedisService } from '../../redis/redis.service'
import type { ChangePasswordDto } from './dto/change-password.dto'
import type { LoginDto } from './dto/login.dto'

/** bcrypt 加密轮次（与 seed 保持一致） */
export const BCRYPT_SALT_ROUNDS = 10

/** 登录失败计数 key 前缀 */
const LOGIN_FAIL_KEY = 'login:fail'
/** 登录锁定 key 前缀 */
const LOGIN_LOCK_KEY = 'login:lock'

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly redis: RedisService,
    private readonly configService: ConfigService<AppConfiguration, true>,
  ) {}

  /**
   * 登录
   * 无论成功失败都写 admin_login_log（记录 IP、结果、时间）。
   */
  async login(dto: LoginDto, request: Request): Promise<LoginVo> {
    const username = dto.username.trim()
    const loginIp = getClientIp(request)

    // 1. 限流检查：同一 username + IP 被锁定则直接拒绝
    await this.assertNotLocked(username, loginIp)

    const user = await this.prisma.adminUser.findUnique({
      where: { username },
      include: { role: { select: { roleName: true, permissions: true } } },
    })

    // 2. 账号不存在 / 密码错误 / 账号禁用，都按失败处理
    if (!user || !(await bcrypt.compare(dto.password, user.password))) {
      await this.registerLoginFailure(username, loginIp, user?.id)
      throw BizException.unauthorized('用户名或密码错误')
    }
    if (user.status !== 1) {
      await this.registerLoginFailure(username, loginIp, user.id)
      throw BizException.unauthorized('账号已被禁用，请联系管理员')
    }

    // 3. 登录成功：写成功日志、更新最后登录时间、清除失败计数
    const now = new Date()
    await this.prisma.adminLoginLog.create({
      data: { adminUserId: user.id, loginIp, loginResult: LoginResult.SUCCESS, loginTime: now },
    })
    await this.prisma.adminUser.update({ where: { id: user.id }, data: { lastLoginAt: now } })
    await this.clearLoginFailure(username, loginIp)

    // 4. 签发令牌：payload 仅 userId / roleId
    const payload: JwtPayload = { userId: user.id, roleId: user.roleId }
    const token = this.jwtService.sign(payload)
    const expiresAt = this.resolveExpiresAt(token)

    const userInfo = buildAdminUserInfo({ ...user, lastLoginAt: now })
    this.logger.log(`登录成功：${user.username}（${loginIp}）`)
    return { token, expiresAt, user: userInfo }
  }

  /** 查询当前登录管理员信息（权限实时查库） */
  async getProfile(userId: number): Promise<AdminUserInfo> {
    const user = await this.prisma.adminUser.findUnique({
      where: { id: userId },
      include: { role: { select: { roleName: true, permissions: true } } },
    })
    if (!user) throw BizException.unauthorized('账号不存在或已被删除')
    if (user.status !== 1) throw BizException.unauthorized('账号已被禁用，请联系管理员')
    return buildAdminUserInfo(user)
  }

  /** 修改当前账号密码 */
  async changePassword(userId: number, dto: ChangePasswordDto): Promise<null> {
    const user = await this.prisma.adminUser.findUnique({ where: { id: userId } })
    if (!user) throw BizException.unauthorized('账号不存在或已被删除')

    const matched = await bcrypt.compare(dto.oldPassword, user.password)
    if (!matched) throw BizException.paramInvalid('当前密码不正确')
    if (dto.oldPassword === dto.newPassword) throw BizException.paramInvalid('新密码不能与当前密码相同')

    const hashed = await bcrypt.hash(dto.newPassword, BCRYPT_SALT_ROUNDS)
    await this.prisma.adminUser.update({ where: { id: userId }, data: { password: hashed } })
    this.logger.log(`账号 ${user.username} 修改密码成功`)
    return null
  }

  /** 由令牌解析过期时间戳（毫秒） */
  private resolveExpiresAt(token: string): number {
    const decoded = this.jwtService.decode<{ exp?: number }>(token)
    if (decoded?.exp) return decoded.exp * 1000
    // 解码异常时按配置的过期时长兜底
    return Date.now() + this.parseDurationToSeconds(this.configService.get('jwtExpiresIn', { infer: true })) * 1000
  }

  /** 解析 "2h" / "30m" / "3600" 形式的时长（秒） */
  private parseDurationToSeconds(expression: string): number {
    const matched = /^(\d+)\s*([smhd])?$/i.exec(expression.trim())
    if (!matched) return 7200
    const value = Number(matched[1])
    switch ((matched[2] ?? 's').toLowerCase()) {
      case 'd':
        return value * 86_400
      case 'h':
        return value * 3_600
      case 'm':
        return value * 60
      default:
        return value
    }
  }

  /* ------------------------------------------------------------------ *
   * 登录失败限流（Redis 不可用时自动跳过，仅记录日志）
   * ------------------------------------------------------------------ */

  /** Redis 限流 key：与 username + IP 绑定 */
  private failKey(username: string, ip: string): string {
    return `${LOGIN_FAIL_KEY}:${username.toLowerCase()}:${ip}`
  }

  private lockKey(username: string, ip: string): string {
    return `${LOGIN_LOCK_KEY}:${username.toLowerCase()}:${ip}`
  }

  /** 被锁定则抛 42900 */
  private async assertNotLocked(username: string, ip: string): Promise<void> {
    if (!this.redis.isAvailable()) return
    const ttl = await this.redis.ttl(this.lockKey(username, ip))
    if (ttl !== null && ttl > 0) {
      const minutes = Math.max(1, Math.ceil(ttl / 60))
      throw BizException.tooManyRequests(`登录失败次数过多，账号已临时锁定，请 ${minutes} 分钟后重试`)
    }
  }

  /**
   * 记录一次登录失败
   * 1. 写失败日志（admin_login_log.loginResult = 0）；
   * 2. 失败计数 +1，达到上限后写入锁定标记（LOGIN_LOCK_SECONDS）。
   */
  private async registerLoginFailure(username: string, ip: string, adminUserId?: number): Promise<void> {
    const logUserId = adminUserId ?? (await this.resolveFallbackUserId())
    if (logUserId === null) {
      this.logger.warn(`登录失败但系统内没有任何管理员账号，无法写入失败日志：${username}（${ip}）`)
    } else {
      await this.prisma.adminLoginLog.create({
        data: { adminUserId: logUserId, loginIp: ip, loginResult: LoginResult.FAIL },
      })
    }

    if (!this.redis.isAvailable()) {
      this.logger.warn(`Redis 不可用，已跳过登录失败限流计数（用户：${username}）`)
      return
    }
    const window = this.configService.get('loginFailWindow', { infer: true })
    const max = this.configService.get('loginFailMax', { infer: true })
    const lockSeconds = this.configService.get('loginLockSeconds', { infer: true })

    const count = await this.redis.increase(this.failKey(username, ip), window)
    if (count !== null && count >= max) {
      await this.redis.setString(this.lockKey(username, ip), String(Date.now()), lockSeconds)
      this.logger.warn(`账号 ${username}（${ip}）登录失败 ${count} 次，已锁定 ${lockSeconds} 秒`)
    }
  }

  /** 登录成功后清除失败计数与锁定标记 */
  private async clearLoginFailure(username: string, ip: string): Promise<void> {
    await this.redis.del(this.failKey(username, ip), this.lockKey(username, ip))
  }

  /** 失败日志需要一个合法的 adminUserId（外键）；用户名不存在时回退到最早的管理员账号 */
  private async resolveFallbackUserId(): Promise<number | null> {
    const fallback = await this.prisma.adminUser.findFirst({
      orderBy: { id: 'asc' },
      select: { id: true },
    })
    return fallback?.id ?? null
  }
}
