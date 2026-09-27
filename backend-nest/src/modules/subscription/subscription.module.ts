/**
 * 邮件订阅模块（骨架）
 *
 * Phase 1 由成员 A 在本目录内实现：
 * - captcha.util.ts（放在 common/utils）生成图形验证码
 * - subscription.service.ts：验证码校验、限流、订阅写入与查询
 * - subscription.controller.ts：@Controller('portal')，公开的验证码与订阅提交
 * - admin-subscription.controller.ts：@Controller('admin/subscriptions')，后台列表与删除
 * - dto/：SubscribeDto、QuerySubscriptionDto
 *
 * 本文件由成员 A 补充 providers 与 controllers。
 */
import { Module } from '@nestjs/common'

@Module({})
export class SubscriptionModule {}
