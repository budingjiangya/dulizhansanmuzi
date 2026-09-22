/**
 * 编辑文章入参（全部字段可选）
 */
import { PartialType } from '@nestjs/swagger'
import { CreateArticleDto } from './create-article.dto'
import type { UpdateArticleDto as IUpdateArticleDto } from '@sanmuzi/contracts'

/** 编辑文章：字段与新增一致但全部可选 */
export class UpdateArticleDto extends PartialType(CreateArticleDto) implements IUpdateArticleDto {}
