/**
 * 单独抽帧入参
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Transform } from 'class-transformer'
import { IsNotEmpty, IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator'
import type { ExtractFrameDto as IExtractFrameDto } from '@sanmuzi/contracts'

export class ExtractFrameDto implements IExtractFrameDto {
  @ApiProperty({
    description: '视频站内地址（上传接口返回的 url）',
    example: '/static/uploads/article-video/2026/01/abc123.mp4',
    maxLength: 512,
  })
  @IsString({ message: 'videoUrl 必须是字符串' })
  @IsNotEmpty({ message: 'videoUrl 不能为空' })
  @MaxLength(512, { message: 'videoUrl 长度不能超过 512 个字符' })
  videoUrl!: string

  @ApiPropertyOptional({ description: '指定时间点（秒）；不传则由后端在时长范围内随机取点', example: 2 })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => (value === '' || value === null ? undefined : Number(value)))
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'time 必须是数字（最多两位小数）' })
  @Min(0, { message: 'time 不能为负数' })
  time?: number
}
