/** 邮件订阅提交（前台公开） */
import type { SubscribeDto, SubscribeResultVo } from '@sanmuzi/contracts'
import { httpPost } from './http'

/**
 * 提交邮件订阅
 * 重复邮箱不会报错，而是返回 { duplicated: true }，由页面提示「已订阅过」。
 */
export function submitSubscription(data: SubscribeDto): Promise<SubscribeResultVo> {
  return httpPost<SubscribeResultVo>('/api/portal/subscriptions', data)
}
