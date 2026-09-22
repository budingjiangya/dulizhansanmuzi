/** 博客文章接口（后台） */
import type {
  ArticleDetailVo,
  ArticleListItemVo,
  ArticleQuery,
  CreateArticleDto,
  PageResult,
  UpdateArticleDto,
} from '@sanmuzi/contracts'
import { http } from './request'

export function fetchArticles(query: ArticleQuery): Promise<PageResult<ArticleListItemVo>> {
  return http.get<PageResult<ArticleListItemVo>>('/api/admin/articles', { ...query })
}

export function fetchArticleDetail(id: number | string): Promise<ArticleDetailVo> {
  return http.get<ArticleDetailVo>(`/api/admin/articles/${id}`)
}

export function createArticle(data: CreateArticleDto): Promise<ArticleDetailVo> {
  return http.post<ArticleDetailVo>('/api/admin/articles', data)
}

export function updateArticle(id: number | string, data: UpdateArticleDto): Promise<ArticleDetailVo> {
  return http.put<ArticleDetailVo>(`/api/admin/articles/${id}`, data)
}

export function deleteArticle(id: number | string): Promise<null> {
  return http.delete<null>(`/api/admin/articles/${id}`)
}

export function toggleArticlePublish(id: number | string, value: boolean): Promise<null> {
  return http.patch<null>(`/api/admin/articles/${id}/publish`, { value })
}

export function toggleArticleRecommend(id: number | string, value: boolean): Promise<null> {
  return http.patch<null>(`/api/admin/articles/${id}/recommend`, { value })
}

export function updateArticleSort(id: number | string, sort: number): Promise<null> {
  return http.patch<null>(`/api/admin/articles/${id}/sort`, { sort })
}
