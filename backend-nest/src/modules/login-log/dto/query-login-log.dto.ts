/**
 * 登录日志查询入参
 */
import { ApiPropertyOptional } from '@nestjs/swagger'
import { Transform } from 'class-transformer'
import { IsIn, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator'
import { PAGE_DEFAULTS, type LoginLogQuery, type LoginResultValue } from '@sanmuzi/contracts'

const toOptionalInt = ({ value }: { value: unknown }): number | undefined => {
  if (value === undefined || value === null || value === '') return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.trunc(parsed) : (value as number)
}

export class QueryLoginLogDto implements LoginLogQuery {
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

  @ApiPropertyOptional({ description: '用户名筛选:用户名模糊匹配', example: 'admin' })
  @IsOptional()
  @IsString({ message: '用户名必须是字符串' })
  @MaxLength(64, { message: '用户名长度不能超过 64 个字符' })
  username?: string

  @ApiPropertyOptional({ description: '登录结果：1 成功，0 失败', example: 1, enum: [0, 1] })
  @IsOptional()
  @Transform(toOptionalInt)
  @IsIn([0, 1], { message: '登录结果只能是 0（失败）或 1（成功）' })
  loginResult?: LoginResultValue

  @ApiPropertyOptional({ description: '开始时间，支持 yyyy-MM-dd 或 yyyy-MM-dd HH:mm:ss', example: '2026-01-01' })
  @IsOptional()
  @IsString({ message: '开始时间必须是字符串' })
  startTime?: string

  @ApiPropertyOptional({
    description: '结束时间，支持 yyyy-MM-dd 或 yyyy-MM-dd HH:mm:ss',
    example: '2026-12-31 23:59:59',
  })
  @IsOptional()
  @IsString({ message: '结束时间必须是字符串' })
  endTime?: string
}
