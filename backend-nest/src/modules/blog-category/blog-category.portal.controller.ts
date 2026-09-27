/**
 * 文章分类控制器（前台，全部 @Public，无需登录）
 * 路由前缀 /portal/categories，供前台分类页与分类文章列表页消费。
 *
 * 与 PortalController 一样，挂在本模块内（业务上属于分类域），
 * 避免把分类查询逻辑塞进 portal 模块造成职责交叉。
 */
import { Controller, Get, HttpStatus, Param, ParseIntPipe, Query } from '@nestjs/common'
import { ApiOkResponse, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger'
import type { ArticleListItemVo, CategoryVo, PageResult } from '@sanmuzi/contracts'
import { Public } from '../../common/decorators/public.decorator'
import { BlogCategoryService } from './blog-category.service'
import { QueryCategoryArticleDto } from './dto/query-category-article.dto'

@ApiTags('前台分类')
@Controller('portal/categories')
export class BlogCategoryPortalController {
  constructor(private readonly blogCategoryService: BlogCategoryService) {}

  @Public()
  @Get()
  @ApiOperation({
    summary: '全部分类',
    description: '前台分类总览：不分页，返回 CategoryVo 数组，按 sort desc, id asc 排序，含各分类文章数量 articleCount。',
  })
  @ApiOkResponse({ description: 'CategoryVo 数组' })
  async list(): Promise<CategoryVo[]> {
    return this.blogCategoryService.listAll()
  }

  @Public()
  @Get(':id/articles')
  @ApiOperation({
    summary: '某分类下的已上架文章',
    description:
      '仅返回该分类下 isPublish=true 的文章，按 sort desc, id desc 排序；列表不含富文本 content；分类不存在返回 40400。',
  })
  @ApiOkResponse({ description: 'PageResult<ArticleListItemVo>' })
  @ApiResponse({ status: 404, description: '分类不存在（40400）' })
  async articles(
    @Param('id', new ParseIntPipe({ errorHttpStatusCode: HttpStatus.BAD_REQUEST })) id: number,
    @Query() query: QueryCategoryArticleDto,
  ): Promise<PageResult<ArticleListItemVo>> {
    return this.blogCategoryService.listPortalArticles(id, query)
  }
}
