/**
 * 权限常量统一出口
 * 守卫、装饰器、业务服务一律从这里导入，避免各处散落字符串常量；
 * 真正的定义在 @sanmuzi/contracts，前后端共用同一份。
 */
export {
  ALL_PERMISSIONS,
  CONTENT_EDITOR_PERMISSIONS,
  PERMISSIONS,
  PERMISSION_GROUPS,
  RoleId,
  ROLE_NAME,
} from '@sanmuzi/contracts'

export type { PermissionCode, PermissionGroup, RoleIdValue } from '@sanmuzi/contracts'
