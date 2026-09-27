/**
 * 图形验证码工具
 *
 * 基于 svg-captcha 生成 SVG 验证码，并统一编码成前端可直接使用的 data URI：
 * 契约 CaptchaVo.imageBase64 要求自带 `data:image/svg+xml;base64,` 前缀，
 * 前端直接塞进 <img src>（不走 v-html），因此前缀在这里固定一份，避免各调用方自己拼。
 *
 * 注意：svg-captcha 的返回结构是 { text, data }，SVG 字符串在 `data` 字段（不是 svg）。
 */
import { create } from 'svg-captcha'

/** SVG 图片的 data URI 前缀（契约要求 imageBase64 自带前缀） */
export const SVG_DATA_URI_PREFIX = 'data:image/svg+xml;base64,'

/**
 * 默认生成参数：
 * 4 位字符、3 条干扰线、彩色；ignoreChars 去掉 0/o/1/i/l/I 等易混淆字符，降低人工识别歧义。
 */
const DEFAULT_CAPTCHA_OPTIONS = {
  size: 4,
  noise: 3,
  color: true,
  ignoreChars: '0o1ilI',
} as const

/** 生成结果：text 为答案原文（由调用方决定如何存储），imageBase64 为可直接渲染的 data URI */
export interface GeneratedCaptcha {
  text: string
  imageBase64: string
}

/** 把 SVG 字符串编码为 data URI */
export function toSvgDataUri(svg: string): string {
  return `${SVG_DATA_URI_PREFIX}${Buffer.from(svg, 'utf8').toString('base64')}`
}

/** 生成一张图形验证码（答案原文 + 已编码好的 data URI） */
export function generateCaptcha(): GeneratedCaptcha {
  const { text, data } = create({ ...DEFAULT_CAPTCHA_OPTIONS })
  return { text, imageBase64: toSvgDataUri(data) }
}
