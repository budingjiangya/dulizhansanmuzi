/** 鉴权接口 */
import type { AdminUserInfo, ChangePasswordDto, LoginDto, LoginVo } from '@sanmuzi/contracts'
import { http } from './request'

export function login(data: LoginDto): Promise<LoginVo> {
  return http.post<LoginVo>('/api/auth/login', data)
}

export function fetchProfile(): Promise<AdminUserInfo> {
  return http.get<AdminUserInfo>('/api/auth/profile')
}

export function changePassword(data: ChangePasswordDto): Promise<null> {
  return http.post<null>('/api/auth/change-password', data)
}
