/**
 * 前台门户控制器（全部 @Public，无需登录）
 * 路由前缀 /portal，供前台站点直接消费。
 */
import { Controller, Get, HttpStatus, Param, ParseIntPipe, Query } from '@nestjs/common'
import { ApiOkResponse, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger'
import type { ArticleDetailVo, ArticleListItemVo, PageResult, SiteConfigVo } from '@sanmuzi/contracts'
import { Public } from '../../common/decorators/public.decorator'
import { QueryPortalArticleDto } from './dto/query-portal-article.dto'
import { PortalService } from './portal.service'

@ApiTags('前台门户')
@Controller('portal')
export class PortalController {
  constructor(private readonly portalService: PortalService) {}

  @Public()
  @Get('site-config')
  @ApiOperation({ summary: '站点配置', description: '返回站点名、副标题、描述、导航与页脚文案，供前台布局使用。' })
  @ApiOkResponse({ description: 'SiteConfigVo' })
  async siteConfig(): Promise<SiteConfigVo> {
    return this.portalService.getSiteConfig()
  }

  @Public()
  @Get('articles')
  @ApiOperation({
    summary: '首页推荐文章列表',
    description: '仅返回 isRecommend=true 且 isPublish=true 的文章，按 sort desc, id desc 排序；列表不含 content。',
  })
  @ApiOkResponse({ description: 'PageResult<ArticleListItemVo>' })
  async articles(@Query() query: QueryPortalArticleDto): Promise<PageResult<ArticleListItemVo>> {
    return this.portalService.listArticles(query)
  }

  @Public()
  @Get('articles/:id')
  @ApiOperation({ summary: '文章详情', description: '返回含富文本 content 的详情；未上架或未推荐的文章按 40400 处理。' })
  @ApiOkResponse({ description: 'ArticleDetailVo' })
  @ApiResponse({ status: 404, description: '文章不存在或已下架（40400）' })
  async articleDetail(
    @Param('id', new ParseIntPipe({ errorHttpStatusCode: HttpStatus.BAD_REQUEST })) id: number,
  ): Promise<ArticleDetailVo> {
    return this.portalService.getArticleDetail(id)
  }
}
