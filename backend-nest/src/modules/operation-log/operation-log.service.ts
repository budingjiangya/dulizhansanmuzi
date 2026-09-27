/**
 * 操作日志服务（只读）
 *
 * 写入侧由全局拦截器 common/interceptors/operation-log.interceptor.ts 负责，
 * 本服务只提供后台日志页的分页查询：
 * - adminUsername 模糊匹配（日志里存的是操作人账号快照，账号删除后依然可查）；
 * - module / result 精确匹配；
 * - startTime / endTime 作用于 createdAt；
 * - 按 createdAt desc, id desc 排序，保证同一秒内的记录分页顺序稳定。
 */
import { Injectable } from '@nestjs/common'
import type { OperationLogVo, PageResult } from '@sanmuzi/contracts'
import { formatDateTime } from '../../common/utils/admin-user.util'
import { buildPageResult, normalizePaging, parseTimeInput } from '../../common/utils/pagination.util'
import { PrismaService } from '../../prisma/prisma.service'
import type { QueryOperationLogDto } from './dto/query-operation-log.dto'

/** 操作日志原始记录（只声明映射需要的字段） */
interface OperationLogRow {
  id: number
  adminUserId: number | null
  adminUsername: string
  module: string
  action: string
  targetType: string | null
  targetId: number | null
  summary: string | null
  requestMethod: string
  requestPath: string
  operationIp: string
  result: number
  errorMessage: string | null
  createdAt: Date
}

@Injectable()
export class OperationLogService {
  constructor(private readonly prisma: PrismaService) {}

  /** 分页查询操作日志（操作人 + 模块 + 结果 + 时间区间筛选） */
  async list(query: QueryOperationLogDto): Promise<PageResult<OperationLogVo>> {
    const { page, pageSize, skip, take } = normalizePaging(query.page, query.pageSize)

    // 前端清空筛选框会传空串，这里统一按「不筛选」处理
    const adminUsername = query.adminUsername?.trim()
    const module = query.module?.trim()
    const start = parseTimeInput(query.startTime)
    const end = parseTimeInput(query.endTime)

    const where = {
      ...(adminUsername ? { adminUsername: { contains: adminUsername } } : {}),
      ...(module ? { module } : {}),
      ...(query.result !== undefined ? { result: query.result } : {}),
      ...(start || end
        ? {
            createdAt: {
              ...(start ? { gte: start } : {}),
              ...(end ? { lte: end } : {}),
            },
          }
        : {}),
    }

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.adminOperationLog.count({ where }),
      this.prisma.adminOperationLog.findMany({
        where,
        skip,
        take,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      }),
    ])

    return buildPageResult(
      rows.map((row) => this.mapLog(row)),
      total,
      page,
      pageSize,
    )
  }

  /** 数据库记录 -> 契约 OperationLogVo（时间统一字符串化） */
  private mapLog(row: OperationLogRow): OperationLogVo {
    return {
      id: row.id,
      adminUserId: row.adminUserId,
      adminUsername: row.adminUsername,
      module: row.module,
      action: row.action,
      targetType: row.targetType,
      targetId: row.targetId,
      summary: row.summary,
      requestMethod: row.requestMethod,
      requestPath: row.requestPath,
      operationIp: row.operationIp,
      result: row.result === 1 ? 1 : 0,
      errorMessage: row.errorMessage,
      createdAt: formatDateTime(row.createdAt) ?? '',
    }
  }
}
