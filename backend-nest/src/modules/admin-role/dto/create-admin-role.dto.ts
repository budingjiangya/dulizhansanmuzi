/**
 * 新增角色入参
 */
import { ApiProperty } from '@nestjs/swagger'
import { ArrayNotEmpty, IsArray, IsNotEmpty, IsString, MaxLength } from 'class-validator'
import type { CreateAdminRoleDto as ICreateAdminRoleDto } from '@sanmuzi/contracts'

export class CreateAdminRoleDto implements ICreateAdminRoleDto {
  @ApiProperty({ description: '角色名称', example: '运营专员', maxLength: 64 })
  @IsString({ message: '角色名称必须是字符串' })
  @IsNotEmpty({ message: '角色名称不能为空' })
  @MaxLength(64, { message: '角色名称长度不能超过 64 个字符' })
  roleName!: string

  @ApiProperty({
    description: '权限码数组（取自 contracts 的 PERMISSIONS）',
    example: ['blog:article:list', 'blog:article:create'],
    type: [String],
  })
  @IsArray({ message: '权限必须是数组' })
  @ArrayNotEmpty({ message: '至少选择一个权限' })
  @IsString({ each: true, message: '权限码必须是字符串' })
  permissions!: string[]
}
