/**
 * 前台文章列表查询入参
 */
import { ApiPropertyOptional } from '@nestjs/swagger'
import { Transform } from 'class-transformer'
import { IsInt, IsOptional, Min } from 'class-validator'
import { PAGE_DEFAULTS, type PageQuery } from '@sanmuzi/contracts'

const toOptionalInt = ({ value }: { value: unknown }): number | undefined => {
  if (value === undefined || value === null || value === '') return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.trunc(parsed) : (value as number)
}

export class QueryPortalArticleDto implements PageQuery {
  @ApiPropertyOptional({ description: '页码，从 1 开始', example: PAGE_DEFAULTS.page, default: PAGE_DEFAULTS.page })
  @IsOptional()
  @Transform(toOptionalInt)
  @IsInt({ message: '页码必须是整数' })
  @Min(1, { message: '页码最小为 1' })
  page?: number

  @ApiPropertyOptional({
    description: '每页条数，最大 100',
    example: 6,
    default: PAGE_DEFAULTS.pageSize,
  })
  @IsOptional()
  @Transform(toOptionalInt)
  @IsInt({ message: '每页条数必须是整数' })
  @Min(1, { message: '每页条数最小为 1' })
  pageSize?: number
}
