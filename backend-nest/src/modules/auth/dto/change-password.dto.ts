/**
 * 修改密码入参
 */
import { ApiProperty } from '@nestjs/swagger'
import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator'
import type { ChangePasswordDto as IChangePasswordDto } from '@sanmuzi/contracts'

export class ChangePasswordDto implements IChangePasswordDto {
  @ApiProperty({ description: '当前密码', example: 'Admin@123456' })
  @IsString({ message: '当前密码必须是字符串' })
  @IsNotEmpty({ message: '当前密码不能为空' })
  oldPassword!: string

  @ApiProperty({ description: '新密码，长度 6-64 位', example: 'Admin@654321', minLength: 6, maxLength: 64 })
  @IsString({ message: '新密码必须是字符串' })
  @IsNotEmpty({ message: '新密码不能为空' })
  @MinLength(6, { message: '新密码长度不能少于 6 位' })
  @MaxLength(64, { message: '新密码长度不能超过 64 位' })
  newPassword!: string
}
