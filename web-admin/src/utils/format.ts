/** 时间格式化工具（基于 dayjs，全后台统一输出格式） */
import dayjs from 'dayjs'
import 'dayjs/locale/zh-cn'
import relativeTime from 'dayjs/plugin/relativeTime'

dayjs.locale('zh-cn')
dayjs.extend(relativeTime)

export const DATE_TIME_FORMAT = 'YYYY-MM-DD HH:mm:ss'
export const DATE_FORMAT = 'YYYY-MM-DD'

export function formatDateTime(value?: string | number | Date | null): string {
  if (!value) return '-'
  const date = dayjs(value)
  return date.isValid() ? date.format(DATE_TIME_FORMAT) : '-'
}

export function formatDate(value?: string | number | Date | null): string {
  if (!value) return '-'
  const date = dayjs(value)
  return date.isValid() ? date.format(DATE_FORMAT) : '-'
}

export function fromNow(value?: string | number | Date | null): string {
  if (!value) return '-'
  const date = dayjs(value)
  return date.isValid() ? date.fromNow() : '-'
}

/** 秒数转可读时长：95 -> 01:35 */
export function formatDuration(seconds?: number | null): string {
  if (seconds === null || seconds === undefined || Number.isNaN(seconds)) return '-'
  const total = Math.max(0, Math.floor(seconds))
  const m = `${Math.floor(total / 60)}`.padStart(2, '0')
  const s = `${total % 60}`.padStart(2, '0')
  return `${m}:${s}`
}

export function formatBytes(bytes?: number | null): string {
  if (!bytes || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const value = bytes / 1024 ** index
  return `${value >= 100 || index === 0 ? Math.round(value) : value.toFixed(1)} ${units[index]}`
}

export { dayjs }
