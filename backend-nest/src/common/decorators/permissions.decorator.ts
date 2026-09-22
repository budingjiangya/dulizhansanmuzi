/**
 * @RequirePermissions() 装饰器
 * 声明访问该接口所需的权限码（任一命中即放行），由 PermissionsGuard 读取并实时查库校验。
 */
import { SetMetadata } from '@nestjs/common'
import type { PermissionCode } from '@sanmuzi/contracts'

/** 元数据 key：接口所需权限码列表 */
export const PERMISSIONS_KEY = 'requirePermissions'

/** 声明接口所需权限码（多个为「或」关系） */
export const RequirePermissions = (...codes: PermissionCode[]): MethodDecorator & ClassDecorator =>
  SetMetadata(PERMISSIONS_KEY, codes)
