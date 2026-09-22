/** 管理员账号接口 */
import type {
  AdminUserQuery,
  AdminUserVo,
  CreateAdminUserDto,
  PageResult,
  ResetPasswordDto,
  UpdateAdminUserDto,
} from '@sanmuzi/contracts'
import { http } from './request'

export function fetchAdminUsers(query: AdminUserQuery): Promise<PageResult<AdminUserVo>> {
  return http.get<PageResult<AdminUserVo>>('/api/admin/users', { ...query })
}

export function createAdminUser(data: CreateAdminUserDto): Promise<AdminUserVo> {
  return http.post<AdminUserVo>('/api/admin/users', data)
}

export function updateAdminUser(id: number, data: UpdateAdminUserDto): Promise<AdminUserVo> {
  return http.put<AdminUserVo>(`/api/admin/users/${id}`, data)
}

export function deleteAdminUser(id: number): Promise<null> {
  return http.delete<null>(`/api/admin/users/${id}`)
}

export function resetAdminUserPassword(id: number, data: ResetPasswordDto): Promise<null> {
  return http.post<null>(`/api/admin/users/${id}/reset-password`, data)
}
