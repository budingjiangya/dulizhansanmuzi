/** 前台文章接口（公开，无需鉴权） */
import type { ArticleDetailVo, ArticleListItemVo, PageResult } from '@sanmuzi/contracts'
import { httpGet } from './http'

export interface PortalArticleQuery {
  page?: number
  pageSize?: number
}

/** 首页卡片列表：仅返回已上架且被标记为推荐的文章，且不含富文本正文 */
export function fetchPortalArticles(query: PortalArticleQuery = {}): Promise<PageResult<ArticleListItemVo>> {
  return httpGet<PageResult<ArticleListItemVo>>('/api/portal/articles', {
    page: query.page ?? 1,
    pageSize: query.pageSize ?? 9,
  })
}

/** 文章详情：含富文本 HTML 正文 */
export function fetchPortalArticleDetail(id: number | string): Promise<ArticleDetailVo> {
  return httpGet<ArticleDetailVo>(`/api/portal/articles/${id}`)
}

/**
 * 站内搜索：匹配标题、摘要与正文，覆盖全部已上架文章（不限于首页推荐位）
 * 结果同样不含富文本正文，列表轻量化。
 */
export function fetchPortalSearch(query: {
  keyword: string
  page?: number
  pageSize?: number
}): Promise<PageResult<ArticleListItemVo>> {
  return httpGet<PageResult<ArticleListItemVo>>('/api/portal/articles/search', {
    keyword: query.keyword,
    page: query.page ?? 1,
    pageSize: query.pageSize ?? 9,
  })
}
