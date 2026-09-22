/**
 * 客户端 IP 工具
 * 反向代理（Nginx / 网关）场景下优先取 x-forwarded-for 的第一个地址。
 */
import type { Request } from 'express'

/** 从请求头或 socket 中解析真实客户端 IP */
export function getClientIp(request: Request): string {
  const forwarded = request.headers['x-forwarded-for']
  const forwardedValue = Array.isArray(forwarded) ? forwarded[0] : forwarded
  if (forwardedValue) {
    const first = forwardedValue.split(',')[0]?.trim()
    if (first) return normalizeIp(first)
  }

  const realIp = request.headers['x-real-ip']
  const realIpValue = Array.isArray(realIp) ? realIp[0] : realIp
  if (realIpValue) return normalizeIp(realIpValue.trim())

  const socketIp = request.socket?.remoteAddress ?? request.ip ?? ''
  return normalizeIp(socketIp)
}

/** IPv4 映射地址归一化：::ffff:127.0.0.1 -> 127.0.0.1；本地回环统一为 127.0.0.1 */
export function normalizeIp(ip: string): string {
  if (!ip) return '0.0.0.0'
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip)
  if (mapped) return mapped[1]
  if (ip === '::1') return '127.0.0.1'
  return ip
}
