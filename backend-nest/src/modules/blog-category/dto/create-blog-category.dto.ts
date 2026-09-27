/**
 * 新增分类入参
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Transform } from 'class-transformer'
import { IsInt, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator'
import type { CreateCategoryDto } from '@sanmuzi/contracts'

/** 空字符串转 undefined，避免前端清空排序权重时被当成非法数字 */
const toOptionalInt = ({ value }: { value: unknown }): number | undefined => {
  if (value === undefined || value === null || value === '') return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.trunc(parsed) : (value as number)
}

export class CreateBlogCategoryDto implements CreateCategoryDto {
  @ApiProperty({ description: '分类名称，全局唯一，最长 64 个字符', example: '显示器', maxLength: 64 })
  @IsString({ message: '分类名称必须是字符串' })
  @IsNotEmpty({ message: '分类名称不能为空' })
  @MaxLength(64, { message: '分类名称长度不能超过 64 个字符' })
  name!: string

  @ApiPropertyOptional({ description: '排序权重，数字越大越靠前，默认 0', example: 10 })
  @IsOptional()
  @Transform(toOptionalInt)
  @IsInt({ message: '排序权重必须是整数' })
  sort?: number
}
