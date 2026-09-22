/**
 * 管理员信息组装工具
 * /auth/login、/auth/profile、/admin/users 共用同一套字段拼装逻辑，
 * 保证契约 AdminUserInfo 在任何入口都一致（含实时权限数组）。
 */
import type { AdminStatusValue, AdminUserInfo } from '@sanmuzi/contracts'
import { parseJsonArray } from './json.util'

/** 组装 AdminUserInfo 所需的最小数据形状 */
export interface AdminUserInfoSource {
  id: number
  username: string
  realName: string
  roleId: number
  status: number
  lastLoginAt: Date | null
  /** 关联角色（可能为空，例如角色被误删） */
  role?: { roleName: string; permissions: string } | null
}

/** 组装当前登录管理员信息 */
export function buildAdminUserInfo(user: AdminUserInfoSource): AdminUserInfo {
  return {
    id: user.id,
    username: user.username,
    realName: user.realName,
    roleId: user.roleId,
    roleName: user.role?.roleName ?? '未知角色',
    status: (user.status === 1 ? 1 : 0) as AdminStatusValue,
    permissions: parseJsonArray(user.role?.permissions),
    lastLoginAt: formatDateTime(user.lastLoginAt),
  }
}

/** 统一的时间格式：yyyy-MM-dd HH:mm:ss（与前端展示保持一致，null 原样返回） */
export function formatDateTime(value: Date | null | undefined): string | null {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return null
  const pad = (input: number): string => `${input}`.padStart(2, '0')
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
  )
}

/** 日期格式：yyyy-MM-dd */
export function formatDate(value: Date): string {
  const pad = (input: number): string => `${input}`.padStart(2, '0')
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`
}
