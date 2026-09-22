/**
 * 文章列表查询入参（管理端）
 */
import { ApiPropertyOptional } from '@nestjs/swagger'
import { Transform } from 'class-transformer'
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator'
import { CoverType, PAGE_DEFAULTS, type ArticleQuery, type CoverTypeValue } from '@sanmuzi/contracts'

const toOptionalInt = ({ value }: { value: unknown }): number | undefined => {
  if (value === undefined || value === null || value === '') return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.trunc(parsed) : (value as number)
}

/** 兼容 'true'/'1'/'yes' 与真实布尔值 */
const toOptionalBoolean = ({ value }: { value: unknown }): boolean | undefined => {
  if (value === undefined || value === null || value === '') return undefined
  if (typeof value === 'boolean') return value
  const normalized = String(value).trim().toLowerCase()
  if (['true', '1', 'yes'].includes(normalized)) return true
  if (['false', '0', 'no'].includes(normalized)) return false
  return value as boolean
}

export class QueryArticleDto implements ArticleQuery {
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

  @ApiPropertyOptional({ description: '标题/简介关键词模糊搜索', example: '显示器' })
  @IsOptional()
  @IsString({ message: '关键词必须是字符串' })
  @MaxLength(64, { message: '关键词长度不能超过 64 个字符' })
  keyword?: string

  @ApiPropertyOptional({ description: '封面类型：image 多图轮播 / video 视频预览', example: 'image', enum: ['image', 'video'] })
  @IsOptional()
  @IsIn([CoverType.IMAGE, CoverType.VIDEO], { message: '封面类型只能是 image 或 video' })
  coverType?: CoverTypeValue

  @ApiPropertyOptional({ description: '是否首页推荐', example: true })
  @IsOptional()
  @Transform(toOptionalBoolean)
  @IsBoolean({ message: '是否推荐必须是布尔值' })
  isRecommend?: boolean

  @ApiPropertyOptional({ description: '是否已上架', example: true })
  @IsOptional()
  @Transform(toOptionalBoolean)
  @IsBoolean({ message: '是否上架必须是布尔值' })
  isPublish?: boolean

  @ApiPropertyOptional({ description: '创建时间起，支持 yyyy-MM-dd 或 yyyy-MM-dd HH:mm:ss', example: '2026-01-01' })
  @IsOptional()
  @IsString({ message: '开始时间必须是字符串' })
  startTime?: string

  @ApiPropertyOptional({
    description: '创建时间止，支持 yyyy-MM-dd 或 yyyy-MM-dd HH:mm:ss',
    example: '2026-12-31 23:59:59',
  })
  @IsOptional()
  @IsString({ message: '结束时间必须是字符串' })
  endTime?: string
}
