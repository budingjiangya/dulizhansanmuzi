/**
 * 邮件订阅提交入参
 * 这里只做基础格式校验；邮箱的规范化（trim + 小写）由 SubscriptionService 统一负责，
 * 保证「已存在判断」与「落库」用的是同一个规范化结果。
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsEmail, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator'
import type { SubscribeDto as ISubscribeDto } from '@sanmuzi/contracts'

export class SubscribeDto implements ISubscribeDto {
  @ApiProperty({
    description: '订阅邮箱，大小写不敏感（后端统一 trim + 转小写）',
    example: 'reader@example.com',
    maxLength: 160,
  })
  @IsString({ message: '邮箱必须是字符串' })
  @IsNotEmpty({ message: '邮箱不能为空' })
  @MaxLength(160, { message: '邮箱长度不能超过 160 个字符' })
  @IsEmail({}, { message: '邮箱格式不正确' })
  email!: string

  @ApiPropertyOptional({
    description: '留言，选填；空串按未填写处理（落库为 null）',
    example: '希望多写一些显示器实测',
    maxLength: 500,
  })
  @IsOptional()
  @IsString({ message: '留言必须是字符串' })
  @MaxLength(500, { message: '留言长度不能超过 500 个字符' })
  message?: string

  @ApiProperty({
    description: '验证码标识，取自 GET /api/portal/captcha 的 captchaId，原样回传',
    example: '2f1c4b6e-9f7a-4a0e-8c1d-3b5e7a9c0d21',
    maxLength: 64,
  })
  @IsString({ message: '验证码标识必须是字符串' })
  @IsNotEmpty({ message: '验证码标识不能为空' })
  @MaxLength(64, { message: '验证码标识长度不能超过 64 个字符' })
  captchaId!: string

  @ApiProperty({ description: '用户填写的验证码，不区分大小写，120 秒内一次有效', example: '7zqk', maxLength: 16 })
  @IsString({ message: '验证码必须是字符串' })
  @IsNotEmpty({ message: '验证码不能为空' })
  @MaxLength(16, { message: '验证码长度不能超过 16 个字符' })
  captchaCode!: string
}
