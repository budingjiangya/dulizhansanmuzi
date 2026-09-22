/**
 * 重置账号密码入参
 */
import { ApiProperty } from '@nestjs/swagger'
import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator'
import type { ResetPasswordDto as IResetPasswordDto } from '@sanmuzi/contracts'

export class ResetPasswordDto implements IResetPasswordDto {
  @ApiProperty({ description: '新密码，6-64 位', example: 'Reset@123456', minLength: 6, maxLength: 64 })
  @IsString({ message: '新密码必须是字符串' })
  @IsNotEmpty({ message: '新密码不能为空' })
  @MinLength(6, { message: '新密码长度不能少于 6 位' })
  @MaxLength(64, { message: '新密码长度不能超过 64 位' })
  newPassword!: string
}
