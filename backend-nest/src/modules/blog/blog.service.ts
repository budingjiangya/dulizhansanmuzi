/**
 * 博客文章服务（管理端 + 前台共用的数据访问与业务规则）
 * 关键规则：
 * 1. 列表接口一律不返回 content（富文本体积大），详情接口才返回；
 * 2. coverImages 统一以 JSON 字符串入库、以字符串数组出参；
 * 3. 任何写操作（增删改 / 上下架 / 推荐 / 排序）后必须清理前台列表缓存。
 */
import { Injectable, Logger } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import {
  CoverType,
  type ArticleDetailVo,
  type ArticleListItemVo,
  type CoverTypeValue,
  type PageResult,
} from '@sanmuzi/contracts'
import { PORTAL_ARTICLES_CACHE_KEY } from '../../common/constants/cache.constants'
import { BizException } from '../../common/exceptions/biz.exception'
import { formatDateTime } from '../../common/utils/admin-user.util'
import { parseJsonArray, stringifyJsonArray } from '../../common/utils/json.util'
import { buildPageResult, normalizePaging, parseTimeInput } from '../../common/utils/pagination.util'
import { PrismaService } from '../../prisma/prisma.service'
import { RedisService } from '../../redis/redis.service'
import type { CreateArticleDto } from './dto/create-article.dto'
import type { QueryArticleDto } from './dto/query-article.dto'
import type { UpdateArticleDto } from './dto/update-article.dto'

/** 列表查询字段：刻意排除 content，避免首页/列表接口拉取富文本正文 */
const LIST_SELECT = {
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

/** 列表行数据结构（不含 content） */
export type ArticleRow = Prisma.BlogArticleGetPayload<{ select: typeof LIST_SELECT }>

/** 详情行数据结构（含 content） */
export type ArticleDetailRow = ArticleRow & { content: string }

@Injectable()
export class BlogService {
  private readonly logger = new Logger(BlogService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  /** 管理端分页查询（不返回 content） */
  async list(query: QueryArticleDto): Promise<PageResult<ArticleListItemVo>> {
    const { page, pageSize, skip, take } = normalizePaging(query.page, query.pageSize)
    const where = this.buildWhere(query)

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.blogArticle.count({ where }),
      this.prisma.blogArticle.findMany({
        where,
        skip,
        take,
        orderBy: [{ sort: 'desc' }, { id: 'desc' }],
        select: LIST_SELECT,
      }),
    ])

    return buildPageResult(rows.map((row) => this.toListItem(row)), total, page, pageSize)
  }

  /** 管理端详情（编辑页回填，含 content 与分类名） */
  async detail(id: number): Promise<ArticleDetailVo> {
    const row = await this.prisma.blogArticle.findUnique({
      where: { id },
      include: { category: { select: { name: true } } },
    })
    if (!row) throw BizException.notFound('文章不存在')
    return this.toDetail(row)
  }

  /** 新增文章 */
  async create(dto: CreateArticleDto): Promise<ArticleDetailVo> {
    const coverImages = this.resolveCoverImages(dto.coverType, dto.coverImages)
    const coverVideo = this.resolveCoverVideo(dto.coverType, dto.coverVideo ?? null)
    const categoryId = await this.resolveCategoryId(dto.categoryId)

    const created = await this.prisma.blogArticle.create({
      data: {
        title: dto.title.trim(),
        shortDesc: dto.shortDesc.trim(),
        coverType: dto.coverType,
        coverImages: coverImages === null ? null : stringifyJsonArray(coverImages),
        coverVideo,
        coverVideoFrame: dto.coverVideoFrame ?? null,
        content: dto.content,
        isRecommend: dto.isRecommend ?? false,
        isPublish: dto.isPublish ?? false,
        sort: dto.sort ?? 0,
        categoryId,
      },
      include: { category: { select: { name: true } } },
    })
    await this.clearPortalCache(`新增文章 id=${created.id}`)
    return this.toDetail(created)
  }

  /** 编辑文章 */
  async update(id: number, dto: UpdateArticleDto): Promise<ArticleDetailVo> {
    const current = await this.prisma.blogArticle.findUnique({ where: { id } })
    if (!current) throw BizException.notFound('文章不存在')

    // 封面类型可能被切换：切换后必须校验对应的封面字段
    const nextCoverType = (dto.coverType ?? current.coverType) as CoverTypeValue
    const nextImages = dto.coverImages ?? parseJsonArray(current.coverImages)
    const nextVideo = dto.coverVideo === undefined ? current.coverVideo : (dto.coverVideo ?? null)

    const updated = await this.prisma.blogArticle.update({
      where: { id },
      data: {
        ...(dto.title !== undefined ? { title: dto.title.trim() } : {}),
        ...(dto.shortDesc !== undefined ? { shortDesc: dto.shortDesc.trim() } : {}),
        ...(dto.coverType !== undefined ? { coverType: nextCoverType } : {}),
        ...(dto.coverImages !== undefined ? { coverImages: stringifyJsonArray(nextImages) } : {}),
        ...(dto.coverVideo !== undefined ? { coverVideo: nextVideo } : {}),
        ...(dto.coverVideoFrame !== undefined ? { coverVideoFrame: dto.coverVideoFrame ?? null } : {}),
        ...(dto.content !== undefined ? { content: dto.content } : {}),
        ...(dto.isRecommend !== undefined ? { isRecommend: dto.isRecommend } : {}),
        ...(dto.isPublish !== undefined ? { isPublish: dto.isPublish } : {}),
        ...(dto.sort !== undefined ? { sort: dto.sort } : {}),
        ...(dto.categoryId !== undefined ? { categoryId: await this.resolveCategoryId(dto.categoryId) } : {}),
      },
      include: { category: { select: { name: true } } },
    })

    // 切换封面类型后做一次完整性校验（例如 image -> video 但没传视频地址）
    this.resolveCoverImages(nextCoverType, parseJsonArray(updated.coverImages))
    this.resolveCoverVideo(nextCoverType, updated.coverVideo)

    await this.clearPortalCache(`编辑文章 id=${id}`)
    return this.toDetail(updated)
  }

  /** 删除文章 */
  async remove(id: number): Promise<null> {
    const current = await this.prisma.blogArticle.findUnique({ where: { id }, select: { id: true } })
    if (!current) throw BizException.notFound('文章不存在')

    await this.prisma.blogArticle.delete({ where: { id } })
    await this.clearPortalCache(`删除文章 id=${id}`)
    this.logger.log(`删除文章 id=${id}`)
    return null
  }

  /** 上下架切换 */
  async togglePublish(id: number, value: boolean): Promise<ArticleListItemVo> {
    await this.assertExists(id)
    const updated = await this.prisma.blogArticle.update({
      where: { id },
      data: { isPublish: value },
      include: { category: { select: { name: true } } },
    })
    await this.clearPortalCache(`上下架切换 id=${id} -> ${value}`)
    return this.toListItem(updated)
  }

  /** 首页推荐切换 */
  async toggleRecommend(id: number, value: boolean): Promise<ArticleListItemVo> {
    await this.assertExists(id)
    const updated = await this.prisma.blogArticle.update({
      where: { id },
      data: { isRecommend: value },
      include: { category: { select: { name: true } } },
    })
    await this.clearPortalCache(`推荐位切换 id=${id} -> ${value}`)
    return this.toListItem(updated)
  }

  /** 更新排序权重 */
  async updateSort(id: number, sort: number): Promise<ArticleListItemVo> {
    await this.assertExists(id)
    const updated = await this.prisma.blogArticle.update({
      where: { id },
      data: { sort },
      include: { category: { select: { name: true } } },
    })
    await this.clearPortalCache(`排序更新 id=${id} -> ${sort}`)
    return this.toListItem(updated)
  }

  /* ------------------------------------------------------------------ *
   * 前台查询（供 PortalService 复用，返回原始记录以便缓存）
   * ------------------------------------------------------------------ */

  /** 前台推荐且已上架的文章分页查询（不含 content，按 sort desc, id desc） */
  async findPortalArticles(page: number, pageSize: number): Promise<{ list: ArticleListItemVo[]; total: number }> {
    const { skip, take } = normalizePaging(page, pageSize)
    const where = { isRecommend: true, isPublish: true }

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.blogArticle.count({ where }),
      this.prisma.blogArticle.findMany({
        where,
        skip,
        take,
        orderBy: [{ sort: 'desc' }, { id: 'desc' }],
        select: LIST_SELECT,
      }),
    ])

    return { list: rows.map((row) => this.toListItem(row)), total }
  }

  /**
   * 前台站内搜索：匹配标题、摘要与正文，覆盖全部已上架文章
   *
   * 注意：正文使用 LIKE '%kw%' 匹配，无法使用索引。当前内容量下无性能问题；
   * 内容规模上来后应改用 MySQL 全文索引（FULLTEXT + MATCH ... AGAINST）或外部搜索引擎。
   * 排序按编辑权重 sort desc、更新时间 updatedAt desc，未做相关性打分。
   */
  async searchPortalArticles(
    keyword: string,
    page: number,
    pageSize: number,
  ): Promise<{ list: ArticleListItemVo[]; total: number }> {
    const { skip, take } = normalizePaging(page, pageSize)
    const where = {
      isPublish: true,
      OR: [
        { title: { contains: keyword } },
        { shortDesc: { contains: keyword } },
        { content: { contains: keyword } },
      ],
    }

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.blogArticle.count({ where }),
      this.prisma.blogArticle.findMany({
        where,
        skip,
        take,
        orderBy: [{ sort: 'desc' }, { updatedAt: 'desc' }],
        select: LIST_SELECT,
      }),
    ])

    return { list: rows.map((row) => this.toListItem(row)), total }
  }

  /**
   * 前台文章详情：未上架按 40400 处理
   *
   * 可见性规则：isPublish 决定「能否被访问」，isRecommend 只决定「是否出现在首页推荐位」。
   * 推荐位是展示位置，不应兼任访问权限 —— 否则「已上架但未推荐」的文章会被站内搜索命中却打不开。
   */
  async findPortalArticleDetail(id: number): Promise<ArticleDetailVo> {
    const row = await this.prisma.blogArticle.findUnique({
      where: { id },
      include: { category: { select: { name: true } } },
    })
    if (!row || !row.isPublish) {
      throw BizException.notFound('文章不存在或已下架')
    }
    return this.toDetail(row)
  }

  /* ------------------------------------------------------------------ *
   * 内部工具
   * ------------------------------------------------------------------ */

  /** 组装列表查询条件 */
  private buildWhere(query: QueryArticleDto) {
    const start = parseTimeInput(query.startTime)
    const end = parseTimeInput(query.endTime)
    const keyword = query.keyword?.trim()

    return {
      ...(keyword
        ? {
            OR: [{ title: { contains: keyword } }, { shortDesc: { contains: keyword } }],
          }
        : {}),
      ...(query.coverType ? { coverType: query.coverType } : {}),
      ...(query.isRecommend !== undefined ? { isRecommend: query.isRecommend } : {}),
      ...(query.isPublish !== undefined ? { isPublish: query.isPublish } : {}),
      ...(start || end
        ? {
            createdAt: {
              ...(start ? { gte: start } : {}),
              ...(end ? { lte: end } : {}),
            },
          }
        : {}),
    }
  }

  /** 文章存在性校验 */
  private async assertExists(id: number): Promise<void> {
    const exists = await this.prisma.blogArticle.findUnique({ where: { id }, select: { id: true } })
    if (!exists) throw BizException.notFound('文章不存在')
  }

  /** 校验并归一化封面图数组 */
  private resolveCoverImages(coverType: CoverTypeValue, images?: string[]): string[] | null {
    if (coverType !== CoverType.IMAGE) return images && images.length > 0 ? images : null
    const list = (images ?? []).map((item) => item.trim()).filter((item) => item !== '')
    if (list.length === 0) throw BizException.paramInvalid('封面类型为多图轮播时，至少需要一张封面图')
    return list
  }

  /** 校验并归一化封面视频地址 */
  private resolveCoverVideo(coverType: CoverTypeValue, video: string | null): string | null {
    if (coverType !== CoverType.VIDEO) return video
    const value = video?.trim() ?? ''
    if (value === '') throw BizException.paramInvalid('封面类型为视频预览时，必须提供短视频地址')
    return value
  }

  /**
   * 校验并解析分类 id
   * undefined / null 表示未分类，返回 null；
   * 传了 id 但分类不存在时抛 40000（比让 Prisma 抛 P2003 映射成 40900 更准确）。
   */
  private async resolveCategoryId(categoryId: number | null | undefined): Promise<number | null> {
    if (categoryId === undefined || categoryId === null) return null
    const exists = await this.prisma.blogCategory.findUnique({
      where: { id: categoryId },
      select: { id: true },
    })
    if (!exists) throw BizException.paramInvalid('所选分类不存在')
    return categoryId
  }

  /** 清理前台列表缓存（写操作后必须调用） */
  private async clearPortalCache(reason: string): Promise<void> {    const deleted = await this.redis.delByPrefix(PORTAL_ARTICLES_CACHE_KEY)
    this.logger.log(`已清理前台文章缓存（${reason}），删除 ${deleted} 个 key`)
  }

  /** 数据库记录 -> 列表项（不含 content） */
  toListItem(row: ArticleRow): ArticleListItemVo {
    return {
      id: row.id,
      title: row.title,
      shortDesc: row.shortDesc,
      coverType: (row.coverType === CoverType.VIDEO ? CoverType.VIDEO : CoverType.IMAGE) as CoverTypeValue,
      coverImages: parseJsonArray(row.coverImages),
      coverVideo: row.coverVideo ?? null,
      coverVideoFrame: row.coverVideoFrame ?? null,
      isRecommend: Boolean(row.isRecommend),
      isPublish: Boolean(row.isPublish),
      sort: row.sort,
      categoryId: row.categoryId ?? null,
      categoryName: row.category?.name ?? null,
      createdAt: formatDateTime(row.createdAt) ?? '',
      updatedAt: formatDateTime(row.updatedAt) ?? '',
    }
  }

  /** 数据库记录 -> 详情（含 content） */
  toDetail(row: ArticleRow & { content?: string | null }): ArticleDetailVo {
    return { ...this.toListItem(row), content: row.content ?? '' }
  }
}
