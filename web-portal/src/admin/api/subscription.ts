/** 邮件订阅接口（后台） */
import type { PageResult, QuerySubscriptionDto, SubscriptionVo } from '@sanmuzi/contracts'
import { http } from './request'

/** 订阅列表：分页，支持按邮箱与时间区间筛选 */
export function fetchSubscriptions(query: QuerySubscriptionDto): Promise<PageResult<SubscriptionVo>> {
  return http.get<PageResult<SubscriptionVo>>('/api/admin/subscriptions', { ...query })
}

export function deleteSubscription(id: number): Promise<null> {
  return http.delete<null>(`/api/admin/subscriptions/${id}`)
}
