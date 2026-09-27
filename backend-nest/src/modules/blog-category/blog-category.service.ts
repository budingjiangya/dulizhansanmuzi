/**
 * 文章分类服务（后台管理 + 前台展示共用一套数据规则）
 *
 * 业务规则：
 * 1. 分类名唯一（trim 后比较）：重名返回 40900，前端可据此提示；
 * 2. 分类被文章占用时不允许删除，返回 40900 并写明还剩几篇文章；
 *    数据层 blog_article.categoryId 为 onDelete: Restrict，服务层校验与数据库约束双保险；
 * 3. 分类列表不分页：分类是有限集合，后台与前台都需要全量数据，
 *    与 GET /admin/roles 的做法保持一致；articleCount 统一由 Prisma 的 _count 聚合，
 *    一次查询取回，不做逐条 count（避免 N+1）；
 * 4. 分类本身的读写不缓存，前台每次请求都取最新数据（写操作后无需清缓存）。
 */
import { Injectable, Logger } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import type { ArticleListItemVo, CategoryVo, PageResult } from '@sanmuzi/contracts'
import { BizException } from '../../common/exceptions/biz.exception'
import { formatDateTime } from '../../common/utils/admin-user.util'
import { buildPageResult, normalizePaging } from '../../common/utils/pagination.util'
import { PrismaService } from '../../prisma/prisma.service'
import { BlogService } from '../blog/blog.service'
import type { CreateBlogCategoryDto } from './dto/create-blog-category.dto'
import type { QueryCategoryArticleDto } from './dto/query-category-article.dto'
import type { UpdateBlogCategoryDto } from './dto/update-blog-category.dto'

/** 分类查询字段：附带该分类下的文章数量 */
const CATEGORY_SELECT = {
  id: true,
  name: true,
  sort: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { articles: true } },
} satisfies Prisma.BlogCategorySelect

/** 分类行数据结构 */
type CategoryRow = Prisma.BlogCategoryGetPayload<{ select: typeof CATEGORY_SELECT }>

/**
 * 前台分类文章列表的查询字段
 *
 * 与 blog.service.ts 顶部的 LIST_SELECT 保持一致（刻意排除体积大的富文本 content），
 * 映射复用 BlogService 的公开方法 toListItem，保证同一份 ArticleListItemVo 契约
 * 在「首页 / 搜索 / 分类」三个入口的出参完全一致，不会两处漂移。
 */
const CATEGORY_ARTICLE_SELECT = {
  id: true,
  title: true,
  shortDesc: true,
  coverType: true,
  coverImages: true,
  coverVideo: true,
  coverVideoFrame: true,
  isRecommend: true,
  isPublish: true,
  sort: true,
  categoryId: true,
  category: { select: { name: true } },
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.BlogArticleSelect

@Injectable()
export class BlogCategoryService {
  private readonly logger = new Logger(BlogCategoryService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly blogService: BlogService,
  ) {}

  /**
   * 全部分类（不分页），按 sort desc, id asc
   * 后台列表与前台分类总览共用：两侧要展示的字段与排序完全一致。
   *
   * 同时返回两个口径的文章数（见 contracts 的 CategoryVo 注释）：
   * - articleCount：全部文章数（含草稿），与「删除是否被占用」的口径一致，后台用；
   * - publishedArticleCount：仅已上架，前台用 —— 否则会出现「显示 5 篇、点进去只有 3 篇」。
   */
  async listAll(): Promise<CategoryVo[]> {
    // 两条查询并发：分类（带总数聚合）+ 已上架数的分组统计（一次 groupBy，避免 N+1）
    const [rows, publishedMap] = await Promise.all([
      this.prisma.blogCategory.findMany({
        orderBy: [{ sort: 'desc' }, { id: 'asc' }],
        select: CATEGORY_SELECT,
      }),
      this.countPublishedGroupByCategory(),
    ])
    return rows.map((row) => this.mapCategory(row, publishedMap.get(row.id) ?? 0))
  }

  /** 新增分类 */
  async create(dto: CreateBlogCategoryDto): Promise<CategoryVo> {
    const name = dto.name.trim()
    // DTO 的 @IsNotEmpty 挡不住纯空格，这里再兜一次
    if (name === '') throw BizException.paramInvalid('分类名称不能为空')
    await this.assertNameAvailable(name)

    const created = await this.prisma.blogCategory.create({
      data: { name, sort: dto.sort ?? 0 },
      select: CATEGORY_SELECT,
    })
    this.logger.log(`新增分类：${created.name}（id=${created.id}，sort=${created.sort}）`)
    // 新建分类必然还没有文章
    return this.mapCategory(created, 0)
  }

  /** 编辑分类（改名时查重名） */
  async update(id: number, dto: UpdateBlogCategoryDto): Promise<CategoryVo> {
    const current = await this.findByIdOrFail(id)

    let name = current.name
    if (dto.name !== undefined) {
      name = dto.name.trim()
      if (name === '') throw BizException.paramInvalid('分类名称不能为空')
      // 名称没变就不必查重，否则会把自己判成重复
      if (name !== current.name) await this.assertNameAvailable(name)
    }

    const updated = await this.prisma.blogCategory.update({
      where: { id },
      data: {
        name,
        ...(dto.sort !== undefined ? { sort: dto.sort } : {}),
      },
      select: CATEGORY_SELECT,
    })
    this.logger.log(`更新分类：${updated.name}（id=${id}）`)
    return this.mapCategory(updated, await this.countPublished(id))
  }

  /** 删除分类（被文章占用时拒绝） */
  async remove(id: number): Promise<null> {
    const current = await this.findByIdOrFail(id)

    // 删除占用校验用「全部文章数」口径：只要还有任何一篇文章（含草稿）引用该分类就不允许删
    const articleCount = current._count.articles
    if (articleCount > 0) {
      throw BizException.conflict(`该分类下还有 ${articleCount} 篇文章，请先调整文章分类后再删除`)
    }

    try {
      await this.prisma.blogCategory.delete({ where: { id } })
    } catch (error) {
      // 校验与删除之间存在并发写入（刚好有文章挂到该分类）时，
      // 数据库的 onDelete: Restrict 会抛 P2003。这里映射为 40900，
      // 保持与「被占用」同一个业务语义，而不是漏成 50000。
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
        throw BizException.conflict('该分类下还有文章，请先调整文章分类后再删除')
      }
      throw error
    }

    this.logger.log(`删除分类：${current.name}（id=${id}）`)
    return null
  }

  /**
   * 前台：某分类下「已上架」文章的分页列表（不含 content）
   * 排序 sort desc, id desc，与首页列表一致；
   * 分类不存在时抛 40400，避免前台拿到一个空列表却不知道分类本身就没了。
   */
  async listPortalArticles(
    categoryId: number,
    query: QueryCategoryArticleDto,
  ): Promise<PageResult<ArticleListItemVo>> {
    await this.findByIdOrFail(categoryId)

    const { page, pageSize, skip, take } = normalizePaging(query.page, query.pageSize)
    const where = { categoryId, isPublish: true }

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.blogArticle.count({ where }),
      this.prisma.blogArticle.findMany({
        where,
        skip,
        take,
        orderBy: [{ sort: 'desc' }, { id: 'desc' }],
        select: CATEGORY_ARTICLE_SELECT,
      }),
    ])

    return buildPageResult(rows.map((row) => this.blogService.toListItem(row)), total, page, pageSize)
  }

  /* ------------------------------------------------------------------ *
   * 内部工具
   * ------------------------------------------------------------------ */

  /** 按分类统计「已上架」文章数：一次 groupBy 取回全部，避免逐条 count 造成 N+1 */
  private async countPublishedGroupByCategory(): Promise<Map<number, number>> {
    const rows = await this.prisma.blogArticle.groupBy({
      by: ['categoryId'],
      where: { isPublish: true, categoryId: { not: null } },
      _count: { _all: true },
    })
    const map = new Map<number, number>()
    for (const row of rows) {
      if (row.categoryId !== null) map.set(row.categoryId, row._count._all)
    }
    return map
  }

  /** 单个分类的「已上架」文章数（新增/编辑返回单条时用） */
  private countPublished(categoryId: number): Promise<number> {
    return this.prisma.blogArticle.count({ where: { categoryId, isPublish: true } })
  }

  /** 查询分类，不存在抛 40400 */
  private async findByIdOrFail(id: number): Promise<CategoryRow> {
    const category = await this.prisma.blogCategory.findUnique({ where: { id }, select: CATEGORY_SELECT })
    if (!category) throw BizException.notFound('分类不存在')
    return category
  }

  /** 分类名唯一性校验（name 为数据库唯一索引字段） */
  private async assertNameAvailable(name: string): Promise<void> {
    const exists = await this.prisma.blogCategory.findUnique({ where: { name }, select: { id: true } })
    if (exists) throw BizException.conflict(`分类名称「${name}」已存在`)
  }

  /** 数据库记录 -> 契约 CategoryVo */
  private mapCategory(row: CategoryRow, publishedArticleCount: number): CategoryVo {
    return {
      id: row.id,
      name: row.name,
      sort: row.sort,
      // 全部文章数（含草稿）：与删除占用校验同一口径，后台展示
      articleCount: row._count.articles,
      // 仅已上架：前台展示，保证与前台实际能列出的文章数一致
      publishedArticleCount,
      createdAt: formatDateTime(row.createdAt) ?? '',
      updatedAt: formatDateTime(row.updatedAt) ?? '',
    }
  }
}
