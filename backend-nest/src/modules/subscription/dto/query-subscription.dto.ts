/**
 * 邮件订阅查询入参
 * 与 QueryLoginLogDto 保持同一套分页/时间区间的写法：查询串里的数字都是字符串，
 * 统一用 Transform 转成整数再交给 class-validator 校验。
 */
import { ApiPropertyOptional } from '@nestjs/swagger'
import { Transform } from 'class-transformer'
import { IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator'
import { PAGE_DEFAULTS, type QuerySubscriptionDto as IQuerySubscriptionDto } from '@sanmuzi/contracts'

const toOptionalInt = ({ value }: { value: unknown }): number | undefined => {
  if (value === undefined || value === null || value === '') return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.trunc(parsed) : (value as number)
}

export class QuerySubscriptionDto implements IQuerySubscriptionDto {
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

  @ApiPropertyOptional({ description: '邮箱筛选：模糊匹配；库内邮箱统一为小写，查询值后端会一并转小写', example: 'reader@' })
  @IsOptional()
  @IsString({ message: '邮箱必须是字符串' })
  @MaxLength(160, { message: '邮箱长度不能超过 160 个字符' })
  email?: string

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
