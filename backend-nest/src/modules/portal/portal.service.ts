/**
 * 前台门户服务
 * 职责：
 * 1. 站点配置（站点名/副标题/描述/导航/页脚）；
 * 2. 首页推荐文章列表（只取 isRecommend + isPublish，按 sort desc, id desc，不返回 content），
 *    使用 Redis 短缓存降低数据库压力；文章任何写操作都会由 BlogService 清理该缓存；
 * 3. 文章详情（含 content），未上架或未推荐按 40400 处理。
 */
import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type { ArticleDetailVo, ArticleListItemVo, PageResult, SiteConfigVo } from '@sanmuzi/contracts'
import { PORTAL_ARTICLES_CACHE_KEY } from '../../common/constants/cache.constants'
import { buildPageResult, normalizePaging } from '../../common/utils/pagination.util'
import type { AppConfiguration } from '../../config/configuration'
import { RedisService } from '../../redis/redis.service'
import { BlogService } from '../blog/blog.service'
import type { QueryPortalArticleDto } from './dto/query-portal-article.dto'
import type { SearchPortalArticleDto } from './dto/search-portal-article.dto'

/** 站点配置缓存 key（配置来自环境变量，进程内固定，无需过期） */
const SITE_CONFIG_CACHE_KEY = 'cache:portal:site-config'

@Injectable()
export class PortalService {
  private readonly logger = new Logger(PortalService.name)

  constructor(
    private readonly blogService: BlogService,
    private readonly redis: RedisService,
    private readonly configService: ConfigService<AppConfiguration, true>,
  ) {}

  /** 站点配置：名称、副标题、描述、导航、页脚 */
  async getSiteConfig(): Promise<SiteConfigVo> {
    const cached = await this.redis.getJson<SiteConfigVo>(SITE_CONFIG_CACHE_KEY)
    if (cached) return cached

    const config: SiteConfigVo = {
      siteName: '三目子',
      siteSubtitle: '把用过的东西，写成能用的建议',
      siteDescription:
        '三目子是一个只写长期实测的产品推荐博客：显示器、耳机、键鼠、家居与桌面好物，每篇都基于真实上手体验，给出明确的购买建议与避坑提示。',
      nav: [
        { label: '首页', path: '/' },
        { label: '全部推荐', path: '/#recommendations' },
        { label: '分类', path: '/category' },
        { label: '关于本站', path: '/about' },
        { label: '邮件订阅', path: '/subscribe' },
      ],
      footerText: `© ${new Date().getFullYear()} 三目子 · 产品推荐`,
      icp: '',
    }

    // 站点配置长期有效（24 小时），避免每次请求都重新组装
    await this.redis.setJson(SITE_CONFIG_CACHE_KEY, config, 86_400)
    return config
  }

  /**
   * 首页推荐文章列表
   * 命中 Redis 缓存直接返回；未命中则查库并回写缓存。
   */
  async listArticles(query: QueryPortalArticleDto): Promise<PageResult<ArticleListItemVo>> {
    const { page, pageSize } = normalizePaging(query.page, query.pageSize)
    const ttl = this.configService.get('portalCacheTtl', { infer: true })
    const cacheKey = `${PORTAL_ARTICLES_CACHE_KEY}:${page}:${pageSize}`

    if (ttl > 0) {
      const cached = await this.redis.getJson<PageResult<ArticleListItemVo>>(cacheKey)
      if (cached) {
        this.logger.debug(`前台文章列表命中缓存：${cacheKey}`)
        return cached
      }
    }

    const { list, total } = await this.blogService.findPortalArticles(page, pageSize)
    const result = buildPageResult(list, total, page, pageSize)

    if (ttl > 0) await this.redis.setJson(cacheKey, result, ttl)
    return result
  }

  /**
   * 站内搜索
   *
   * 与首页列表不同，这里覆盖全部已上架文章，且**不做 Redis 缓存**：
   * 每个不同关键词都会产生一个缓存键，命中率极低且会污染缓存空间。
   */
  async searchArticles(query: SearchPortalArticleDto): Promise<PageResult<ArticleListItemVo>> {
    const { page, pageSize } = normalizePaging(query.page, query.pageSize)
    const keyword = query.keyword.trim()
    const { list, total } = await this.blogService.searchPortalArticles(keyword, page, pageSize)
    return buildPageResult(list, total, page, pageSize)
  }

  /** 文章详情（含 content），未上架按 40400 */
  async getArticleDetail(id: number): Promise<ArticleDetailVo> {
    return this.blogService.findPortalArticleDetail(id)
  }
}
