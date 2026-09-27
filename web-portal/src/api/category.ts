/** 分类接口（前台公开） */
import type { ArticleListItemVo, CategoryVo, PageResult } from '@sanmuzi/contracts'
import { httpGet } from './http'

/** 全部分类（含各分类文章数），供前台分类总览页使用 */
export function fetchPortalCategories(): Promise<CategoryVo[]> {
  return httpGet<CategoryVo[]>('/api/portal/categories')
}

/** 某个分类下已上架的文章列表 */
export function fetchPortalCategoryArticles(
  id: number | string,
  query: { page?: number; pageSize?: number } = {},
): Promise<PageResult<ArticleListItemVo>> {
  return httpGet<PageResult<ArticleListItemVo>>(`/api/portal/categories/${id}/articles`, {
    page: query.page ?? 1,
    pageSize: query.pageSize ?? 9,
  })
}
