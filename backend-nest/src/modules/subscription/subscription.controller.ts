/**
 * 前台订阅控制器（公开接口，无需登录）
 * 路由前缀 /portal：图形验证码与邮件订阅提交。
 * 与 PortalController 共用 portal 前缀，但具体路径互不重叠
 * （portal/captcha、portal/subscriptions vs portal/site-config、portal/articles）。
 */
import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req } from '@nestjs/common'
import { ApiOkResponse, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger'
import type { CaptchaVo, SubscribeResultVo } from '@sanmuzi/contracts'
import type { Request } from 'express'
import { Public } from '../../common/decorators/public.decorator'
import { getClientIp } from '../../common/utils/ip.util'
import { SubscribeDto } from './dto/subscribe.dto'
import { SubscriptionService } from './subscription.service'

@ApiTags('前台订阅')
@Controller('portal')
export class SubscriptionController {
  constructor(private readonly subscriptionService: SubscriptionService) {}

  @Public()
  @Get('captcha')
  @ApiOperation({
    summary: '获取图形验证码',
    description:
      '返回验证码标识 captchaId 与可直接用于 <img src> 的 SVG data URI（imageBase64）；' +
      '答案只存在服务端，120 秒内有效且一次使用。',
  })
  @ApiOkResponse({ description: 'CaptchaVo' })
  async captcha(): Promise<CaptchaVo> {
    return this.subscriptionService.createCaptcha()
  }

  @Public()
  @Post('subscriptions')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '提交邮件订阅',
    description:
      '依次校验图形验证码（一次性）、按 IP 限流（1 小时 5 次）、规范化邮箱并判重；' +
      '邮箱已订阅时返回 duplicated=true 且不新建记录，响应不含订阅明细。',
  })
  @ApiResponse({ status: 400, description: '验证码错误或已过期（40000）' })
  @ApiResponse({ status: 429, description: '提交过于频繁（42900）' })
  @ApiOkResponse({ description: 'SubscribeResultVo' })
  async subscribe(@Body() dto: SubscribeDto, @Req() request: Request): Promise<SubscribeResultVo> {
    const ip = getClientIp(request)
    const userAgent = request.headers['user-agent']
    return this.subscriptionService.subscribe(dto, ip, userAgent)
  }
}
