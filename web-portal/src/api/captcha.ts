/** 图形验证码接口（前台公开） */
import type { CaptchaVo } from '@sanmuzi/contracts'
import { httpGet } from './http'

/**
 * 获取图形验证码
 * 返回的 imageBase64 已经是可以直接放进 <img src> 的 data URI，
 * 前端不要用它做 v-html 注入。
 */
export function fetchCaptcha(): Promise<CaptchaVo> {
  return httpGet<CaptchaVo>('/api/portal/captcha')
}
