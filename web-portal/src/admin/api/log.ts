/** 登录日志接口 */
import type { LoginLogQuery, LoginLogVo, PageResult } from '@sanmuzi/contracts'
import { http } from './request'

export function fetchLoginLogs(query: LoginLogQuery): Promise<PageResult<LoginLogVo>> {
  return http.get<PageResult<LoginLogVo>>('/api/admin/login-logs', { ...query })
}
