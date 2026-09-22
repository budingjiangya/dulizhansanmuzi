/**
 * 分页参数工具
 * 契约 PAGE_DEFAULTS：page 默认 1、pageSize 默认 10、上限 100。
 */
import { PAGE_DEFAULTS, type PageResult } from '@sanmuzi/contracts'

/** 归一化后的分页参数 */
export interface NormalizedPaging {
  page: number
  pageSize: number
  skip: number
  take: number
}

/** 归一化 page / pageSize，防止负数、超大值 */
export function normalizePaging(page?: number, pageSize?: number): NormalizedPaging {
  const safePage = Number.isFinite(page) && (page ?? 0) > 0 ? Math.floor(page as number) : PAGE_DEFAULTS.page
  const rawSize =
    Number.isFinite(pageSize) && (pageSize ?? 0) > 0 ? Math.floor(pageSize as number) : PAGE_DEFAULTS.pageSize
  const safeSize = Math.min(rawSize, PAGE_DEFAULTS.maxPageSize)
  return { page: safePage, pageSize: safeSize, skip: (safePage - 1) * safeSize, take: safeSize }
}

/** 组装统一分页响应 */
export function buildPageResult<T>(list: T[], total: number, page: number, pageSize: number): PageResult<T> {
  return {
    list,
    total,
    page,
    pageSize,
    totalPages: pageSize > 0 ? Math.ceil(total / pageSize) : 0,
  }
}

/** 把 yyyy-MM-dd / yyyy-MM-dd HH:mm:ss / ISO 字符串解析为 Date；非法返回 null */
export function parseTimeInput(value?: string): Date | null {
  if (!value || value.trim() === '') return null
  const raw = value.trim()
  // yyyy-MM-dd 或 yyyy-MM-dd HH:mm:ss 在 Node 中可能存在兼容性问题，统一改写为 ISO 风格
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(raw)
    ? `${raw}T00:00:00`
    : raw.replace(' ', 'T')
  const date = new Date(normalized)
  return Number.isNaN(date.getTime()) ? null : date
}

/** 当天 00:00:00 */
export function startOfToday(): Date {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0)
}

/** 相对今天偏移 n 天的 00:00:00（n 为负表示过去） */
export function startOfDayOffset(days: number): Date {
  const base = startOfToday()
  base.setDate(base.getDate() + days)
  return base
}
