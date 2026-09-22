/**
 * 分片上传初始化入参
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Transform } from 'class-transformer'
import { IsInt, IsNotEmpty, IsOptional, IsString, MaxLength, Min } from 'class-validator'
import type { ChunkInitDto as IChunkInitDto } from '@sanmuzi/contracts'

export class ChunkInitDto implements IChunkInitDto {
  @ApiProperty({
    description: '文件唯一标识（建议前端按 name+size+lastModified 生成），用于秒传与断点续传',
    example: 'a1b2c3d4e5f60718293a4b5c6d7e8f90',
  })
  @IsString({ message: 'fileHash 必须是字符串' })
  @IsNotEmpty({ message: 'fileHash 不能为空' })
  @MaxLength(128, { message: 'fileHash 长度不能超过 128 个字符' })
  fileHash!: string

  @ApiProperty({ description: '原始文件名（含扩展名）', example: 'product-demo.mp4' })
  @IsString({ message: 'fileName 必须是字符串' })
  @IsNotEmpty({ message: 'fileName 不能为空' })
  @MaxLength(255, { message: '文件名长度不能超过 255 个字符' })
  fileName!: string

  @ApiProperty({ description: '文件总大小（字节）', example: 10485760 })
  @Transform(({ value }: { value: unknown }) => (value === '' || value === null ? undefined : Number(value)))
  @IsInt({ message: 'fileSize 必须是整数' })
  @Min(1, { message: 'fileSize 必须大于 0' })
  fileSize!: number

  @ApiProperty({ description: '分片大小（字节）', example: 8388608 })
  @Transform(({ value }: { value: unknown }) => (value === '' || value === null ? undefined : Number(value)))
  @IsInt({ message: 'chunkSize 必须是整数' })
  @Min(1, { message: 'chunkSize 必须大于 0' })
  chunkSize!: number

  @ApiProperty({ description: '分片总数', example: 2 })
  @Transform(({ value }: { value: unknown }) => (value === '' || value === null ? undefined : Number(value)))
  @IsInt({ message: 'totalChunks 必须是整数' })
  @Min(1, { message: 'totalChunks 必须大于 0' })
  totalChunks!: number

  @ApiPropertyOptional({ description: '文件 MIME 类型', example: 'video/mp4' })
  @IsOptional()
  @IsString({ message: 'mimeType 必须是字符串' })
  @MaxLength(128, { message: 'mimeType 长度不能超过 128 个字符' })
  mimeType?: string
}
