/**
 * 登录日志服务
 * 查询时需要 join 出 username / realName：schema 中日志通过 adminUserId 关联 admin_user，
 * 这里用一次批量查询用户信息再内存拼装，避免逐条查询造成的 N+1。
 */
import { Injectable } from '@nestjs/common'
import type { LoginLogVo, LoginResultValue, PageResult } from '@sanmuzi/contracts'
import { buildPageResult, normalizePaging, parseTimeInput } from '../../common/utils/pagination.util'
import { formatDateTime } from '../../common/utils/admin-user.util'
import { PrismaService } from '../../prisma/prisma.service'
import type { QueryLoginLogDto } from './dto/query-login-log.dto'

/** 登录日志原始记录 */
interface LoginLogRow {
  id: number
  adminUserId: number
  loginIp: string
  loginResult: number
  loginTime: Date
}

@Injectable()
export class LoginLogService {
  constructor(private readonly prisma: PrismaService) {}

  /** 分页查询登录日志（时间区间 + 用户名 + 结果筛选） */
  async list(query: QueryLoginLogDto): Promise<PageResult<LoginLogVo>> {
    const { page, pageSize, skip, take } = normalizePaging(query.page, query.pageSize)

    // 用户名为模糊匹配：先取候选账号 ID，再参与 where
    let adminUserIds: number[] | null = null
    if (query.username) {
      const users = await this.prisma.adminUser.findMany({
        where: { username: { contains: query.username } },
        select: { id: true },
      })
      adminUserIds = users.map((user) => user.id)
      if (adminUserIds.length === 0) return buildPageResult<LoginLogVo>([], 0, page, pageSize)
    }

    const start = parseTimeInput(query.startTime)
    const end = parseTimeInput(query.endTime)

    const where = {
      ...(adminUserIds ? { adminUserId: { in: adminUserIds } } : {}),
      ...(query.loginResult !== undefined ? { loginResult: query.loginResult } : {}),
      ...(start || end
        ? {
            loginTime: {
              ...(start ? { gte: start } : {}),
              ...(end ? { lte: end } : {}),
            },
          }
        : {}),
    }

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.adminLoginLog.count({ where }),
      this.prisma.adminLoginLog.findMany({
        where,
        skip,
        take,
        orderBy: [{ loginTime: 'desc' }, { id: 'desc' }],
      }),
    ])

    const users = await this.loadUsers(rows.map((row) => row.adminUserId))
    return buildPageResult(
      rows.map((row) => this.mapLog(row, users)),
      total,
      page,
      pageSize,
    )
  }

  /** 批量加载账号信息（id -> username / realName） */
  private async loadUsers(ids: number[]): Promise<Map<number, { username: string; realName: string }>> {
    const unique = Array.from(new Set(ids))
    if (unique.length === 0) return new Map()
    const users = await this.prisma.adminUser.findMany({
      where: { id: { in: unique } },
      select: { id: true, username: true, realName: true },
    })
    return new Map(users.map((user) => [user.id, { username: user.username, realName: user.realName }]))
  }

  /** 数据库记录 -> 契约 LoginLogVo */
  private mapLog(row: LoginLogRow, users: Map<number, { username: string; realName: string }>): LoginLogVo {
    const user = users.get(row.adminUserId)
    return {
      id: row.id,
      adminUserId: row.adminUserId,
      username: user?.username ?? '已删除账号',
      realName: user?.realName ?? null,
      loginIp: row.loginIp,
      loginResult: (row.loginResult === 1 ? 1 : 0) as LoginResultValue,
      loginTime: formatDateTime(row.loginTime) ?? '',
    }
  }
}
