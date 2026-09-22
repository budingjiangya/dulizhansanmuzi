/**
 * 工作台统计服务
 * 提供后台首页所需的文章、账号、登录统计与最近 7 天登录趋势（缺失日期补 0）。
 */
import { Injectable } from '@nestjs/common'
import { LoginResult, type DashboardStatsVo } from '@sanmuzi/contracts'
import { formatDate, formatDateTime } from '../../common/utils/admin-user.util'
import { startOfDayOffset, startOfToday } from '../../common/utils/pagination.util'
import { PrismaService } from '../../prisma/prisma.service'

/** 趋势天数 */
const TREND_DAYS = 7

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  /** 汇总统计 + 最近 7 天登录趋势 */
  async getStats(): Promise<DashboardStatsVo> {
    const today = startOfToday()
    const trendStart = startOfDayOffset(-(TREND_DAYS - 1))

    const [
      articleTotal,
      articlePublished,
      recommendTotal,
      adminUserTotal,
      loginToday,
      loginFailToday,
      trendRows,
    ] = await Promise.all([
      this.prisma.blogArticle.count(),
      this.prisma.blogArticle.count({ where: { isPublish: true } }),
      this.prisma.blogArticle.count({ where: { isRecommend: true } }),
      this.prisma.adminUser.count(),
      this.prisma.adminLoginLog.count({ where: { loginTime: { gte: today } } }),
      this.prisma.adminLoginLog.count({ where: { loginTime: { gte: today }, loginResult: LoginResult.FAIL } }),
      this.prisma.adminLoginLog.findMany({
        where: { loginTime: { gte: trendStart } },
        select: { loginTime: true, loginResult: true },
      }),
    ])

    return {
      articleTotal,
      articlePublished,
      articleDraft: articleTotal - articlePublished,
      recommendTotal,
      adminUserTotal,
      loginToday,
      loginFailToday,
      loginTrend: this.buildTrend(trendRows, trendStart),
    }
  }

  /** 按日期聚合登录记录，缺失的日期补 0 */
  private buildTrend(
    rows: Array<{ loginTime: Date; loginResult: number }>,
    trendStart: Date,
  ): Array<{ date: string; success: number; fail: number }> {
    const buckets = new Map<string, { success: number; fail: number }>()
    for (let index = 0; index < TREND_DAYS; index += 1) {
      const day = startOfDayOffset(index - (TREND_DAYS - 1))
      buckets.set(formatDate(day), { success: 0, fail: 0 })
    }

    for (const row of rows) {
      const key = formatDate(row.loginTime)
      const bucket = buckets.get(key)
      if (!bucket) continue
      if (row.loginResult === LoginResult.SUCCESS) {
        bucket.success += 1
      } else {
        bucket.fail += 1
      }
    }

    return Array.from(buckets.entries()).map(([date, value]) => ({
      date,
      success: value.success,
      fail: value.fail,
    }))
  }

  /** 最近一次登录时间（供后续扩展使用） */
  async getLatestLoginTime(): Promise<string | null> {
    const row = await this.prisma.adminLoginLog.findFirst({
      orderBy: { loginTime: 'desc' },
      select: { loginTime: true },
    })
    return formatDateTime(row?.loginTime ?? null)
  }
}
