/**
 * 操作日志控制器
 * 路由前缀 /admin/operation-logs。
 * 查询本身是只读 GET，不会触发操作日志记录，不存在递归写入。
 */
import { Controller, Get, Query } from '@nestjs/common'
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger'
import { PERMISSIONS, type OperationLogVo, type PageResult } from '@sanmuzi/contracts'
import { RequirePermissions } from '../../common/decorators/permissions.decorator'
import { QueryOperationLogDto } from './dto/query-operation-log.dto'
import { OperationLogService } from './operation-log.service'

@ApiTags('操作日志')
@ApiBearerAuth()
@Controller('admin/operation-logs')
export class OperationLogController {
  constructor(private readonly operationLogService: OperationLogService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.SYSTEM_OPLOG_LIST)
  @ApiOperation({
    summary: '分页查询操作日志',
    description:
      '支持操作人账号模糊、模块精确、结果（1 成功 / 0 失败）与时间区间筛选，按操作时间倒序返回；' +
      '失败记录带 errorMessage。操作人账号是写入时的快照，账号改名或删除后日志仍可读。',
  })
  @ApiOkResponse({ description: 'PageResult<OperationLogVo>' })
  async list(@Query() query: QueryOperationLogDto): Promise<PageResult<OperationLogVo>> {
    return this.operationLogService.list(query)
  }
}
