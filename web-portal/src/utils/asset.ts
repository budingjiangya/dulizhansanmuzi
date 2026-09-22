/**
 * 资源地址解析：后端入库的是站内相对地址（/static/uploads/...），
 * 也允许直接存远程地址（演示素材）。此处统一转成浏览器可加载的地址。
 */
import { ASSET_BASE } from '@/config'

const ABSOLUTE_PATTERN = /^(https?:)?\/\//i
const DATA_PATTERN = /^data:/i

export function resolveAssetUrl(raw?: string | null): string {
  if (!raw) return ''
  const value = raw.trim()
  if (!value) return ''
  if (ABSOLUTE_PATTERN.test(value) || DATA_PATTERN.test(value)) return value
  const normalized = value.startsWith('/') ? value : `/${value}`
  return `${ASSET_BASE}${normalized}`
}

export function resolveAssetList(list?: readonly string[] | null): string[] {
  if (!list?.length) return []
  return list.map((item) => resolveAssetUrl(item)).filter(Boolean)
}
