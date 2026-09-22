/** 角色接口 */
import type { AdminRoleVo, CreateAdminRoleDto, UpdateAdminRoleDto } from '@sanmuzi/contracts'
import { http } from './request'

export function fetchRoles(): Promise<AdminRoleVo[]> {
  return http.get<AdminRoleVo[]>('/api/admin/roles')
}

export function createRole(data: CreateAdminRoleDto): Promise<AdminRoleVo> {
  return http.post<AdminRoleVo>('/api/admin/roles', data)
}

export function updateRole(id: number, data: UpdateAdminRoleDto): Promise<AdminRoleVo> {
  return http.put<AdminRoleVo>(`/api/admin/roles/${id}`, data)
}

export function deleteRole(id: number): Promise<null> {
  return http.delete<null>(`/api/admin/roles/${id}`)
}
