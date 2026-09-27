/**
 * 操作日志查询入参
 * 字段与 contracts 的 QueryOperationLogDto 一一对应。
 */
import { ApiPropertyOptional } from '@nestjs/swagger'
import { Transform } from 'class-transformer'
import { IsIn, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator'
import { PAGE_DEFAULTS, type QueryOperationLogDto as IQueryOperationLogDto } from '@sanmuzi/contracts'

/** 空字符串转 undefined，避免前端清空筛选条件时被当成非法数字 */
const toOptionalInt = ({ value }: { value: unknown }): number | undefined => {
  if (value === undefined || value === null || value === '') return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.trunc(parsed) : (value as number)
}

export class QueryOperationLogDto implements IQueryOperationLogDto {
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

  @ApiPropertyOptional({ description: '操作人账号模糊筛选', example: 'adm' })
  @IsOptional()
  @IsString({ message: '操作人账号必须是字符串' })
  @MaxLength(64, { message: '操作人账号长度不能超过 64 个字符' })
  adminUsername?: string

  @ApiPropertyOptional({ description: '模块精确筛选', example: 'blog:category' })
  @IsOptional()
  @IsString({ message: '模块必须是字符串' })
  @MaxLength(32, { message: '模块长度不能超过 32 个字符' })
  module?: string

  @ApiPropertyOptional({ description: '操作结果：1 成功，0 失败', example: 1, enum: [0, 1] })
  @IsOptional()
  @Transform(toOptionalInt)
  @IsIn([0, 1], { message: '操作结果只能是 0（失败）或 1（成功）' })
  result?: number

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
