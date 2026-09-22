/**
 * 列表内快速切换上下架 / 推荐位入参
 */
import { ApiProperty } from '@nestjs/swagger'
import { IsBoolean } from 'class-validator'
import type { ToggleArticleDto as IToggleArticleDto } from '@sanmuzi/contracts'

export class ToggleArticleDto implements IToggleArticleDto {
  @ApiProperty({ description: '目标状态：true 开启，false 关闭', example: true })
  @IsBoolean({ message: 'value 必须是布尔值' })
  value!: boolean
}
