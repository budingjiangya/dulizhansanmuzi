/**
 * 文章分类模块
 *
 * 后台接口：/admin/categories（CRUD，四个权限码）
 * 前台接口：/portal/categories（@Public 只读）
 *
 * 前台「某分类下文章列表」复用 BlogModule 导出的 BlogService，
 * 用它的公开方法 toListItem 完成映射，保证 ArticleListItemVo 的出参
 * 与首页、搜索两个入口完全一致。
 */
import { Module } from '@nestjs/common'
import { BlogModule } from '../blog/blog.module'
import { BlogCategoryController } from './blog-category.controller'
import { BlogCategoryPortalController } from './blog-category.portal.controller'
import { BlogCategoryService } from './blog-category.service'

@Module({
  imports: [BlogModule],
  controllers: [BlogCategoryController, BlogCategoryPortalController],
  providers: [BlogCategoryService],
  exports: [BlogCategoryService],
})
export class BlogCategoryModule {}
