/**
 * 分片合并入参
 */
import { ApiProperty } from '@nestjs/swagger'
import { IsNotEmpty, IsString, MaxLength } from 'class-validator'
import type { ChunkMergeDto as IChunkMergeDto } from '@sanmuzi/contracts'

export class ChunkMergeDto implements IChunkMergeDto {
  @ApiProperty({ description: '分片上传会话 ID（init 接口返回）', example: '3f1c9a2e-5b7d-4c8e-9f01-2a3b4c5d6e7f' })
  @IsString({ message: 'uploadId 必须是字符串' })
  @IsNotEmpty({ message: 'uploadId 不能为空' })
  @MaxLength(128, { message: 'uploadId 长度不能超过 128 个字符' })
  uploadId!: string
}
