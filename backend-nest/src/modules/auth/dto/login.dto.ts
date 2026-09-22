/**
 * 登录入参
 */
import { ApiProperty } from '@nestjs/swagger'
import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator'
import type { LoginDto as ILoginDto } from '@sanmuzi/contracts'

export class LoginDto implements ILoginDto {
  @ApiProperty({ description: '登录用户名', example: 'admin', maxLength: 64 })
  @IsString({ message: '用户名必须是字符串' })
  @IsNotEmpty({ message: '用户名不能为空' })
  @MaxLength(64, { message: '用户名长度不能超过 64 个字符' })
  username!: string

  @ApiProperty({ description: '登录密码（明文，服务端 bcrypt 校验）', example: 'Admin@123456', minLength: 6 })
  @IsString({ message: '密码必须是字符串' })
  @IsNotEmpty({ message: '密码不能为空' })
  @MinLength(6, { message: '密码长度不能少于 6 位' })
  @MaxLength(64, { message: '密码长度不能超过 64 位' })
  password!: string
}
