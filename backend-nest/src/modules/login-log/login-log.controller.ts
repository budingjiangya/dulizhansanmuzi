/**
 * 登录日志控制器
 * 路由前缀 /admin/login-logs。
 */
import { Controller, Get, Query } from '@nestjs/common'
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger'
import { PERMISSIONS, type LoginLogVo, type PageResult } from '@sanmuzi/contracts'
import { RequirePermissions } from '../../common/decorators/permissions.decorator'
import { QueryLoginLogDto } from './dto/query-login-log.dto'
import { LoginLogService } from './login-log.service'

@ApiTags('登录日志')
@ApiBearerAuth()
@Controller('admin/login-logs')
export class LoginLogController {
  constructor(private readonly loginLogService: LoginLogService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.SYSTEM_LOG_LIST)
  @ApiOperation({
    summary: '分页查询登录日志',
    description: '支持时间区间、用户名、登录结果筛选，结果中已 join 出 username 与 realName。',
  })
  @ApiOkResponse({ description: 'PageResult<LoginLogVo>' })
  async list(@Query() query: QueryLoginLogDto): Promise<PageResult<LoginLogVo>> {
    return this.loginLogService.list(query)
  }
}
