/**
 * 文章分类模块（骨架）
 *
 * Phase 1 由成员 B 在本目录内实现：
 * - blog-category.service.ts：listAll / create / update / remove（删除前校验是否被文章占用）
 * - blog-category.controller.ts：@Controller('admin/categories')，四个权限码
 * - dto/：CreateBlogCategoryDto、UpdateBlogCategoryDto
 *
 * 本文件由成员 B 补充 providers 与 controllers。
 */
import { Module } from '@nestjs/common'

@Module({})
export class BlogCategoryModule {}
