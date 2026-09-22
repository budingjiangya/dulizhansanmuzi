/**
 * 编辑管理员账号入参（全部字段可选）
 */
import { ApiPropertyOptional } from '@nestjs/swagger'
import { Transform } from 'class-transformer'
import { IsIn, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator'
import type { AdminStatusValue, UpdateAdminUserDto as IUpdateAdminUserDto } from '@sanmuzi/contracts'

/** 空字符串统一转为 undefined，便于「不修改」语义 */
const emptyToUndefined = ({ value }: { value: unknown }): unknown =>
  value === '' || value === null ? undefined : value

export class UpdateAdminUserDto implements IUpdateAdminUserDto {
  @ApiPropertyOptional({ description: '登录用户名（唯一，不传表示不修改）', example: 'editor02', maxLength: 64 })
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString({ message: '用户名必须是字符串' })
  @MaxLength(64, { message: '用户名长度不能超过 64 个字符' })
  username?: string

  @ApiPropertyOptional({ description: '真实姓名', example: '内容编辑', maxLength: 64 })
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString({ message: '真实姓名必须是字符串' })
  @MaxLength(64, { message: '真实姓名长度不能超过 64 个字符' })
  realName?: string

  @ApiPropertyOptional({ description: '所属角色 ID', example: 1 })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => (value === '' || value === null ? undefined : Number(value)))
  @IsInt({ message: '角色 ID 必须是整数' })
  @Min(1, { message: '角色 ID 必须大于 0' })
  roleId?: number

  @ApiPropertyOptional({ description: '账号状态：1 启用，0 禁用', example: 1, enum: [0, 1] })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => (value === '' || value === null ? undefined : Number(value)))
  @IsIn([0, 1], { message: '账号状态只能是 0（禁用）或 1（启用）' })
  status?: AdminStatusValue
}
