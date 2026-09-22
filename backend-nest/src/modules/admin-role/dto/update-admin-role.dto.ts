/**
 * 编辑角色入参（全部字段可选）
 */
import { ApiPropertyOptional } from '@nestjs/swagger'
import { IsArray, IsOptional, IsString, MaxLength } from 'class-validator'
import type { UpdateAdminRoleDto as IUpdateAdminRoleDto } from '@sanmuzi/contracts'

export class UpdateAdminRoleDto implements IUpdateAdminRoleDto {
  @ApiPropertyOptional({ description: '角色名称', example: '内容编辑', maxLength: 64 })
  @IsOptional()
  @IsString({ message: '角色名称必须是字符串' })
  @MaxLength(64, { message: '角色名称长度不能超过 64 个字符' })
  roleName?: string

  @ApiPropertyOptional({
    description: '权限码数组，覆盖式更新',
    example: ['blog:article:list', 'blog:article:upload'],
    type: [String],
  })
  @IsOptional()
  @IsArray({ message: '权限必须是数组' })
  @IsString({ each: true, message: '权限码必须是字符串' })
  permissions?: string[]
}
