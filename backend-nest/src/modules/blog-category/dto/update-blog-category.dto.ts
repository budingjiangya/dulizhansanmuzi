/**
 * 编辑分类入参（全部字段可选）
 */
import { PartialType } from '@nestjs/swagger'
import type { UpdateCategoryDto as IUpdateCategoryDto } from '@sanmuzi/contracts'
import { CreateBlogCategoryDto } from './create-blog-category.dto'

/** 编辑分类：字段与新增一致但全部可选，未传的字段保持原值 */
export class UpdateBlogCategoryDto extends PartialType(CreateBlogCategoryDto) implements IUpdateCategoryDto {}
