/**
 * 全局权限守卫（RBAC）
 * 规则：
 * 1. 读取 @RequirePermissions(...codes) 元数据，未声明则视为「仅需登录」；
 * 2. 每次请求都实时查库读取 AdminRole.permissions 并 JSON.parse —— 权限变更立即生效，
 *    绝不把权限数组塞进 JWT；
 * 3. 超级管理员同样走这条查库链路，保证行为一致；
 * 4. 命中任意一个权限码即放行，否则返回 40300。
 */
import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator'
import { BizException } from '../exceptions/biz.exception'
import { PrismaService } from '../../prisma/prisma.service'
import { parseJsonArray } from '../utils/json.util'

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required =
      this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? []
    if (required.length === 0) return true

    const request = context.switchToHttp().getRequest<{ user?: { userId?: number; roleId?: number } }>()
    const payload = request.user
    if (!payload?.userId || !payload.roleId) throw BizException.unauthorized()

    // 实时查库：角色可能已被删除，或权限已被调整
    const role = await this.prisma.adminRole.findUnique({
      where: { id: payload.roleId },
      select: { permissions: true },
    })
    if (!role) throw BizException.forbidden('当前账号的角色不存在或已被删除')

    const granted = parseJsonArray(role.permissions)
    const allowed = required.some((code) => granted.includes(code))
    if (!allowed) throw BizException.forbidden()
    return true
  }
}
