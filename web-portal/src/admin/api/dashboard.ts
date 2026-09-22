/** 工作台统计接口 */
import type { DashboardStatsVo } from '@sanmuzi/contracts'
import { http } from './request'

export function fetchDashboardStats(): Promise<DashboardStatsVo> {
  return http.get<DashboardStatsVo>('/api/admin/dashboard/stats')
}
