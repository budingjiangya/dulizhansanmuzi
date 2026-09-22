/**
 * 新增文章入参
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Transform } from 'class-transformer'
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator'
import { CoverType, type CoverTypeValue, type CreateArticleDto as ICreateArticleDto } from '@sanmuzi/contracts'

const toOptionalBoolean = ({ value }: { value: unknown }): boolean | undefined => {
  if (value === undefined || value === null || value === '') return undefined
  if (typeof value === 'boolean') return value
  const normalized = String(value).trim().toLowerCase()
  if (['true', '1', 'yes'].includes(normalized)) return true
  if (['false', '0', 'no'].includes(normalized)) return false
  return value as boolean
}

export class CreateArticleDto implements ICreateArticleDto {
  @ApiProperty({ description: '文章标题', example: '2026 年最值得入手的 6 款 4K 显示器推荐', maxLength: 255 })
  @IsString({ message: '标题必须是字符串' })
  @IsNotEmpty({ message: '标题不能为空' })
  @MaxLength(255, { message: '标题长度不能超过 255 个字符' })
  title!: string

  @ApiProperty({
    description: '首页卡片简介，建议 40-80 字',
    example: '我们从色准、亮度、接口与价格四个维度实测了 6 款 4K 显示器，帮你按预算快速选出最合适的一台。',
  })
  @IsString({ message: '简介必须是字符串' })
  @IsNotEmpty({ message: '简介不能为空' })
  @MaxLength(500, { message: '简介长度不能超过 500 个字符' })
  shortDesc!: string

  @ApiProperty({ description: '封面类型：image 多图轮播 / video 视频悬浮预览', example: CoverType.IMAGE, enum: ['image', 'video'] })
  @IsIn([CoverType.IMAGE, CoverType.VIDEO], { message: '封面类型只能是 image 或 video' })
  coverType!: CoverTypeValue

  @ApiPropertyOptional({
    description: '封面多图地址数组（coverType=image 时必填）',
    example: ['/static/uploads/article-image/2026/01/demo-1.jpg'],
    type: [String],
  })
  @IsOptional()
  @IsArray({ message: '封面图必须是数组' })
  @IsString({ each: true, message: '封面图地址必须是字符串' })
  coverImages?: string[]

  @ApiPropertyOptional({ description: '封面短视频地址（coverType=video 时必填）', example: '/static/uploads/demo/trailer.mp4' })
  @IsOptional()
  @IsString({ message: '视频地址必须是字符串' })
  @MaxLength(512, { message: '视频地址长度不能超过 512 个字符' })
  coverVideo?: string | null

  @ApiPropertyOptional({ description: '视频抽帧静态封面地址', example: '/static/uploads/video-frame/2026/01/frame.jpg' })
  @IsOptional()
  @IsString({ message: '抽帧封面地址必须是字符串' })
  @MaxLength(512, { message: '抽帧封面地址长度不能超过 512 个字符' })
  coverVideoFrame?: string | null

  @ApiProperty({
    description: '富文本 HTML 正文',
    example: '<h2>选购思路</h2><p>先确定预算区间，再按用途筛选面板类型。</p>',
  })
  @IsString({ message: '正文必须是字符串' })
  @IsNotEmpty({ message: '正文不能为空' })
  content!: string

  @ApiPropertyOptional({ description: '是否首页推荐，默认 false', example: true })
  @IsOptional()
  @Transform(toOptionalBoolean)
  @IsBoolean({ message: '是否推荐必须是布尔值' })
  isRecommend?: boolean

  @ApiPropertyOptional({ description: '是否上架，默认 false', example: true })
  @IsOptional()
  @Transform(toOptionalBoolean)
  @IsBoolean({ message: '是否上架必须是布尔值' })
  isPublish?: boolean

  @ApiPropertyOptional({ description: '首页排序权重，数字越大越靠前，默认 0', example: 60 })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => (value === '' || value === null ? undefined : Number(value)))
  @IsInt({ message: '排序权重必须是整数' })
  sort?: number
}
