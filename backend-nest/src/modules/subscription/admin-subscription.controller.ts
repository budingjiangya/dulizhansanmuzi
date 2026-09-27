/**
 * 邮件订阅后台控制器
 * 路由前缀 /admin/subscriptions，接口均需对应权限码；
 * 前缀与前台 portal 不同，因此单独一个控制器类。
 */
import { Controller, Delete, Get, HttpStatus, Param, ParseIntPipe, Query } from '@nestjs/common'
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger'
import { PERMISSIONS, type PageResult, type SubscriptionVo } from '@sanmuzi/contracts'
import { OperationLog } from '../../common/decorators/operation-log.decorator'
import { RequirePermissions } from '../../common/decorators/permissions.decorator'
import { QuerySubscriptionDto } from './dto/query-subscription.dto'
import { SubscriptionService } from './subscription.service'

@ApiTags('邮件订阅管理')
@ApiBearerAuth()
@Controller('admin/subscriptions')
export class AdminSubscriptionController {
  constructor(private readonly subscriptionService: SubscriptionService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.SYSTEM_SUBSCRIBE_LIST)
  @ApiOperation({
    summary: '分页查询邮件订阅',
    description: '支持邮箱模糊与提交时间区间筛选，按 createdAt desc 排序；时间字段已格式化为字符串。',
  })
  @ApiOkResponse({ description: 'PageResult<SubscriptionVo>' })
  async list(@Query() query: QuerySubscriptionDto): Promise<PageResult<SubscriptionVo>> {
    return this.subscriptionService.listSubscriptions(query)
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.SYSTEM_SUBSCRIBE_DELETE)
  @OperationLog({ module: 'system:subscribe', action: 'delete', targetType: 'subscription' })
  @ApiOperation({
    summary: '删除邮件订阅',
    description: '删除指定订阅记录；记录不存在返回 40400。该操作会写入后台操作日志。',
  })
  @ApiOkResponse({ description: '删除成功，data 为 null' })
  @ApiResponse({ status: 404, description: '订阅记录不存在（40400）' })
  async remove(
    @Param('id', new ParseIntPipe({ errorHttpStatusCode: HttpStatus.BAD_REQUEST })) id: number,
  ): Promise<null> {
    return this.subscriptionService.removeSubscription(id)
  }
}
