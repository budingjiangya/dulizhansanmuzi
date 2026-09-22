/**
 * 安全 JSON 工具
 * 数据库里的 permissions / coverImages 都以 JSON 字符串存放，
 * 解析失败必须降级为空数组而不是抛异常，避免一条脏数据打挂整个列表接口。
 */

/** 安全解析 JSON 字符串数组：非法输入统一返回空数组 */
export function parseJsonArray(value: unknown): string[] {
  if (value === null || value === undefined) return []
  if (Array.isArray(value)) return value.map((item) => String(item)).filter((item) => item !== '')

  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (trimmed === '') return []
    // 容错：历史数据可能是逗号分隔的裸字符串
    if (!trimmed.startsWith('[')) {
      return trimmed
        .split(',')
        .map((item) => item.trim())
        .filter((item) => item !== '')
    }
    try {
      const parsed: unknown = JSON.parse(trimmed)
      return parseJsonArray(parsed)
    } catch {
      return []
    }
  }
  return []
}

/** 安全序列化字符串数组：始终写出合法 JSON，空数组写为 "[]" */
export function stringifyJsonArray(value: unknown): string {
  return JSON.stringify(parseJsonArray(value))
}

/** 解析 JSON 数组并断言元素类型（用于数字型数组，例如已上传分片序号） */
export function parseJsonNumberArray(value: unknown): number[] {
  return parseJsonArray(value)
    .map((item) => Number(item))
    .filter((item) => Number.isFinite(item))
}
