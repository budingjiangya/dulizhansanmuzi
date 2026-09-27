/** 操作日志接口（后台） */
import type { OperationLogVo, PageResult, QueryOperationLogDto } from '@sanmuzi/contracts'
import { http } from './request'

/** 操作日志：分页，支持按操作人、模块、结果与时间区间筛选 */
export function fetchOperationLogs(query: QueryOperationLogDto): Promise<PageResult<OperationLogVo>> {
  return http.get<PageResult<OperationLogVo>>('/api/admin/operation-logs', { ...query })
}
