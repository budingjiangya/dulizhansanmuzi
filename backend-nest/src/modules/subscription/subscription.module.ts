/**
 * 邮件订阅模块
 *
 * 组成：
 * - captcha.util.ts（common/utils）：svg-captcha 生成 SVG 并编码为 data URI
 * - subscription.service.ts：验证码签发与校验、IP 限流、订阅写入与判重、后台查询与删除
 * - subscription.controller.ts：@Controller('portal')，公开的验证码与订阅提交
 * - admin-subscription.controller.ts：@Controller('admin/subscriptions')，后台列表与删除
 * - dto/：SubscribeDto、QuerySubscriptionDto
 *
 * PrismaModule / RedisModule 均为 @Global，这里无需 imports。
 */
import { Module } from '@nestjs/common'
import { AdminSubscriptionController } from './admin-subscription.controller'
import { SubscriptionController } from './subscription.controller'
import { SubscriptionService } from './subscription.service'

@Module({
  controllers: [SubscriptionController, AdminSubscriptionController],
  providers: [SubscriptionService],
  exports: [SubscriptionService],
})
export class SubscriptionModule {}
