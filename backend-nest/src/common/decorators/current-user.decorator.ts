/**
 * @CurrentUser() 参数装饰器
 * 从请求上下文取出 JWT 校验后挂载的用户载荷 { userId, roleId }。
 */
import { createParamDecorator, type ExecutionContext } from '@nestjs/common'
import type { JwtPayload } from '@sanmuzi/contracts'
import type { Request } from 'express'

/** 取出当前登录用户载荷（未登录时为 undefined，仅用于 @Public 之外的路由） */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): JwtPayload => {
    const request = ctx.switchToHttp().getRequest<Request & { user?: JwtPayload }>()
    return request.user as JwtPayload
  },
)
