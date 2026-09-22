/**
 * JWT 策略（passport-jwt 4.x）
 * 校验流程：签名/过期校验 -> 查库确认账号存在且 status=1 -> 返回 { userId, roleId }。
 * 注意：payload 中只有 userId / roleId，权限每次请求由 PermissionsGuard 实时查库获取。
 */
import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { PassportStrategy } from '@nestjs/passport'
import type { JwtPayload } from '@sanmuzi/contracts'
import { ExtractJwt, Strategy } from 'passport-jwt'
import type { AppConfiguration } from '../../../config/configuration'
import { BizException } from '../../../common/exceptions/biz.exception'
import { PrismaService } from '../../../prisma/prisma.service'

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    configService: ConfigService<AppConfiguration, true>,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      // 与 JwtModule 保持一致：使用 Buffer 形式的密钥
      secretOrKey: Buffer.from(String(configService.get('jwtSecret', { infer: true })), 'utf8'),
    })
  }

  /** 校验通过后挂载到 request.user */
  async validate(payload: JwtPayload): Promise<JwtPayload> {
    if (!payload?.userId || !payload?.roleId) throw BizException.unauthorized()

    const user = await this.prisma.adminUser.findUnique({
      where: { id: payload.userId },
      select: { id: true, roleId: true, status: true },
    })
    if (!user) throw BizException.unauthorized('账号不存在或已被删除')
    if (user.status !== 1) throw BizException.unauthorized('账号已被禁用，请联系管理员')

    // 以数据库中的最新角色为准，避免令牌签发后角色被改而越权
    return { userId: user.id, roleId: user.roleId }
  }
}
