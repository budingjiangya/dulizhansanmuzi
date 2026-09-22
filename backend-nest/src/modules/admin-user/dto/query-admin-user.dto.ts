/**
 * 管理员账号列表查询入参
 */
import { ApiPropertyOptional } from '@nestjs/swagger'
import { Transform } from 'class-transformer'
import { IsIn, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator'
import { PAGE_DEFAULTS, type AdminStatusValue, type AdminUserQuery } from '@sanmuzi/contracts'

/** 空字符串转 undefined，避免前端清空筛选条件时被当成非法数字 */
const toOptionalInt = ({ value }: { value: unknown }): number | undefined => {
  if (value === undefined || value === null || value === '') return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.trunc(parsed) : (value as number)
}

export class QueryAdminUserDto implements AdminUserQuery {
  @ApiPropertyOptional({ description: '页码，从 1 开始', example: PAGE_DEFAULTS.page, default: PAGE_DEFAULTS.page })
  @IsOptional()
  @Transform(toOptionalInt)
  @IsInt({ message: '页码必须是整数' })
  @Min(1, { message: '页码最小为 1' })
  page?: number

  @ApiPropertyOptional({
    description: '每页条数，最大 100',
    example: PAGE_DEFAULTS.pageSize,
    default: PAGE_DEFAULTS.pageSize,
  })
  @IsOptional()
  @Transform(toOptionalInt)
  @IsInt({ message: '每页条数必须是整数' })
  @Min(1, { message: '每页条数最小为 1' })
  pageSize?: number

  @ApiPropertyOptional({ description: '用户名模糊筛选', example: 'adm' })
  @IsOptional()
  @IsString({ message: '用户名必须是字符串' })
  @MaxLength(64, { message: '用户名长度不能超过 64 个字符' })
  username?: string

  @ApiPropertyOptional({ description: '真实姓名模糊筛选', example: '超级' })
  @IsOptional()
  @IsString({ message: '真实姓名必须是字符串' })
  @MaxLength(64, { message: '真实姓名长度不能超过 64 个字符' })
  realName?: string

  @ApiPropertyOptional({ description: '角色 ID 精确筛选', example: 2 })
  @IsOptional()
  @Transform(toOptionalInt)
  @IsInt({ message: '角色 ID 必须是整数' })
  roleId?: number

  @ApiPropertyOptional({ description: '账号状态：1 启用，0 禁用', example: 1, enum: [0, 1] })
  @IsOptional()
  @Transform(toOptionalInt)
  @IsIn([0, 1], { message: '账号状态只能是 0（禁用）或 1（启用）' })
  status?: AdminStatusValue
}
