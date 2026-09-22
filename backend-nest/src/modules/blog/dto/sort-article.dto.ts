/**
 * 文章排序权重入参
 */
import { ApiProperty } from '@nestjs/swagger'
import { Transform } from 'class-transformer'
import { IsInt } from 'class-validator'
import type { SortArticleDto as ISortArticleDto } from '@sanmuzi/contracts'

export class SortArticleDto implements ISortArticleDto {
  @ApiProperty({ description: '排序权重，数字越大越靠前', example: 60 })
  @Transform(({ value }: { value: unknown }) => (value === '' || value === null ? undefined : Number(value)))
  @IsInt({ message: '排序权重必须是整数' })
  sort!: number
}
