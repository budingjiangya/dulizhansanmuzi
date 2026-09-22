/**
 * 全局 JWT 鉴权守卫
 * 规则：
 * 1. @Public() 标记的接口（登录、前台门户）直接放行；
 * 2. 其余接口要求 Authorization: Bearer <token>，由 passport-jwt 策略校验；
 * 3. 令牌缺失/无效/过期/账号被禁用统一返回 40100，并使用中文提示。
 */
import { ExecutionContext, Injectable } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { AuthGuard } from '@nestjs/passport'
import { IS_PUBLIC_KEY } from '../decorators/public.decorator'
import { BizException } from '../exceptions/biz.exception'

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super()
  }

  canActivate(context: ExecutionContext) {
    const isPublic =
      this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? false
    if (isPublic) return true
    return super.canActivate(context)
  }

  /** 统一把鉴权失败转换为 40100 业务码 */
  handleRequest<TUser>(err: unknown, user: TUser | false): TUser {
    if (err) {
      if (err instanceof BizException) throw err
      throw BizException.unauthorized(err instanceof Error ? err.message : undefined)
    }
    if (!user) throw BizException.unauthorized()
    return user
  }
}
