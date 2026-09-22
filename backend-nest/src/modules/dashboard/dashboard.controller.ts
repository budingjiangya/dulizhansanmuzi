/**
 * 工作台控制器
 * 路由前缀 /admin/dashboard，统计接口需要文章列表权限即可访问。
 */
import { Controller, Get } from '@nestjs/common'
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger'
import { PERMISSIONS, type DashboardStatsVo } from '@sanmuzi/contracts'
import { RequirePermissions } from '../../common/decorators/permissions.decorator'
import { DashboardService } from './dashboard.service'

@ApiTags('工作台')
@ApiBearerAuth()
@Controller('admin/dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('stats')
  @RequirePermissions(PERMISSIONS.BLOG_ARTICLE_LIST)
  @ApiOperation({
    summary: '工作台统计',
    description: '返回文章总数/已上架/草稿/推荐数与账号数，以及最近 7 天登录趋势（缺失日期补 0）。',
  })
  @ApiOkResponse({ description: 'DashboardStatsVo' })
  async stats(): Promise<DashboardStatsVo> {
    return this.dashboardService.getStats()
  }
}
