/**
 * 新增管理员账号入参
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Transform } from 'class-transformer'
import { IsIn, IsInt, IsNotEmpty, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator'
import type { AdminStatusValue, CreateAdminUserDto as ICreateAdminUserDto } from '@sanmuzi/contracts'

export class CreateAdminUserDto implements ICreateAdminUserDto {
  @ApiProperty({ description: '登录用户名（唯一）', example: 'editor02', maxLength: 64 })
  @IsString({ message: '用户名必须是字符串' })
  @IsNotEmpty({ message: '用户名不能为空' })
  @MaxLength(64, { message: '用户名长度不能超过 64 个字符' })
  username!: string

  @ApiProperty({ description: '初始密码，6-64 位，服务端 bcrypt 加密', example: 'Editor@123456', minLength: 6 })
  @IsString({ message: '密码必须是字符串' })
  @IsNotEmpty({ message: '密码不能为空' })
  @MinLength(6, { message: '密码长度不能少于 6 位' })
  @MaxLength(64, { message: '密码长度不能超过 64 位' })
  password!: string

  @ApiProperty({ description: '真实姓名', example: '内容编辑', maxLength: 64 })
  @IsString({ message: '真实姓名必须是字符串' })
  @IsNotEmpty({ message: '真实姓名不能为空' })
  @MaxLength(64, { message: '真实姓名长度不能超过 64 个字符' })
  realName!: string

  @ApiProperty({ description: '所属角色 ID', example: 2 })
  @Transform(({ value }: { value: unknown }) => (value === '' || value === null ? undefined : Number(value)))
  @IsInt({ message: '角色 ID 必须是整数' })
  @Min(1, { message: '角色 ID 必须大于 0' })
  roleId!: number

  @ApiPropertyOptional({ description: '账号状态：1 启用（默认），0 禁用', example: 1, enum: [0, 1] })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => (value === '' || value === null ? undefined : Number(value)))
  @IsIn([0, 1], { message: '账号状态只能是 0（禁用）或 1（启用）' })
  status?: AdminStatusValue
}
