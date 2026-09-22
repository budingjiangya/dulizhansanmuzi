/**
 * 统一响应包装与分页契约
 * 后端所有接口（含错误）都返回该结构；两个前端共用同一份解析逻辑。
 */

/** 业务响应码：0 表示成功，其余为业务/鉴权错误 */
export const BizCode = {
  /** 成功 */
  SUCCESS: 0,
  /** 参数校验失败 */
  PARAM_INVALID: 40000,
  /** 未登录或 Token 无效/过期 */
  UNAUTHORIZED: 40100,
  /** 已登录但无该接口权限 */
  FORBIDDEN: 40300,
  /** 资源不存在 */
  NOT_FOUND: 40400,
  /** 业务冲突（用户名重复等） */
  CONFLICT: 40900,
  /** 触发限流（登录失败次数过多） */
  TOO_MANY_REQUESTS: 42900,
  /** 服务端异常 */
  SERVER_ERROR: 50000,
} as const

export type BizCodeValue = (typeof BizCode)[keyof typeof BizCode]

/** 统一响应体 */
export interface ApiResponse<T = unknown> {
  /** 业务码，0 为成功 */
  code: number
  /** 提示信息，成功时为 "ok" */
  message: string
  /** 业务数据 */
  data: T
  /** 服务端时间戳（毫秒） */
  timestamp: number
  /** 出错时的请求追踪 ID，便于对照后端日志 */
  traceId?: string
}

/** 统一分页请求参数 */
export interface PageQuery {
  page?: number
  pageSize?: number
}

/** 统一分页响应 */
export interface PageResult<T> {
  list: T[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

/** 统一排序方向 */
export type SortOrder = 'asc' | 'desc'

/** 时间区间筛选（ISO 字符串或 yyyy-MM-dd HH:mm:ss） */
export interface TimeRangeQuery {
  startTime?: string
  endTime?: string
}

/** 后端分页参数归一化后的内部约定（供后端 DTO 默认值参考） */
export const PAGE_DEFAULTS = {
  page: 1,
  pageSize: 10,
  maxPageSize: 100,
} as const

export function isApiResponse(value: unknown): value is ApiResponse {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Partial<ApiResponse>
  return typeof candidate.code === 'number' && 'data' in candidate
}
