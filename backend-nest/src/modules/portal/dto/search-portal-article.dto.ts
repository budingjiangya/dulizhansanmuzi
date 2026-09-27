/**
 * 前台站内搜索入参
 *
 * keyword 必填：trim 后长度 1–50。为空或超限时 ValidationPipe 抛 BadRequest，
 * 经全局异常过滤器映射为业务码 40000，并把约束消息（含「关键词」字样）透出。
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Transform } from 'class-transformer'
import { IsInt, IsNotEmpty, IsOptional, IsString, MaxLength, Min } from 'class-validator'
import { PAGE_DEFAULTS, type PortalSearchQuery } from '@sanmuzi/contracts'

/** 关键词最大长度（前端输入框 maxlength 必须与此保持一致） */
export const SEARCH_KEYWORD_MAX_LENGTH = 50

const toOptionalInt = ({ value }: { value: unknown }): number | undefined => {
  if (value === undefined || value === null || value === '') return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.trunc(parsed) : (value as number)
}

export class SearchPortalArticleDto implements PortalSearchQuery {
  @ApiProperty({
    description: '搜索关键词，匹配标题、摘要与富文本正文',
    example: '显示器',
    maxLength: SEARCH_KEYWORD_MAX_LENGTH,
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString({ message: '关键词必须是字符串' })
  @IsNotEmpty({ message: '请输入搜索关键词' })
  @MaxLength(SEARCH_KEYWORD_MAX_LENGTH, { message: `关键词不能超过 ${SEARCH_KEYWORD_MAX_LENGTH} 个字符` })
  keyword!: string

  @ApiPropertyOptional({ description: '页码，从 1 开始', example: PAGE_DEFAULTS.page, default: PAGE_DEFAULTS.page })
  @IsOptional()
  @Transform(toOptionalInt)
  @IsInt({ message: '页码必须是整数' })
  @Min(1, { message: '页码最小为 1' })
  page?: number

  @ApiPropertyOptional({ description: '每页条数，最大 100', example: 9, default: PAGE_DEFAULTS.pageSize })
  @IsOptional()
  @Transform(toOptionalInt)
  @IsInt({ message: '每页条数必须是整数' })
  @Min(1, { message: '每页条数最小为 1' })
  pageSize?: number
}
