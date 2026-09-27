/**
 * 博客文章控制器（管理端）
 * 路由前缀 /admin/articles，业务逻辑全部在 BlogService。
 */
import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Put, Query, HttpStatus } from '@nestjs/common'
import { ApiBearerAuth, ApiBody, ApiOkResponse, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger'
import {
  PERMISSIONS,
  type ArticleDetailVo,
  type ArticleListItemVo,
  type PageResult,
} from '@sanmuzi/contracts'
import { OperationLog } from '../../common/decorators/operation-log.decorator'
import { RequirePermissions } from '../../common/decorators/permissions.decorator'
import { BlogService } from './blog.service'
import { CreateArticleDto } from './dto/create-article.dto'
import { QueryArticleDto } from './dto/query-article.dto'
import { SortArticleDto } from './dto/sort-article.dto'
import { ToggleArticleDto } from './dto/toggle-article.dto'
import { UpdateArticleDto } from './dto/update-article.dto'

@ApiTags('博客文章')
@ApiBearerAuth()
@Controller('admin/articles')
export class BlogController {
  constructor(private readonly blogService: BlogService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.BLOG_ARTICLE_LIST)
  @ApiOperation({
    summary: '分页查询文章',
    description: '支持关键词、封面类型、推荐位、上下架与创建时间区间筛选；列表不返回富文本 content。',
  })
  @ApiOkResponse({ description: 'PageResult<ArticleListItemVo>' })
  async list(@Query() query: QueryArticleDto): Promise<PageResult<ArticleListItemVo>> {
    return this.blogService.list(query)
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.BLOG_ARTICLE_LIST)
  @ApiOperation({ summary: '文章详情（编辑页回填）', description: '返回含 content 的 ArticleDetailVo。' })
  @ApiOkResponse({ description: 'ArticleDetailVo' })
  @ApiResponse({ status: 404, description: '文章不存在（40400）' })
  async detail(
    @Param('id', new ParseIntPipe({ errorHttpStatusCode: HttpStatus.BAD_REQUEST })) id: number,
  ): Promise<ArticleDetailVo> {
    return this.blogService.detail(id)
  }

  @Post()
  @RequirePermissions(PERMISSIONS.BLOG_ARTICLE_CREATE)
  @OperationLog({ module: 'blog:article', action: 'create', targetType: 'article' })
  @ApiOperation({ summary: '新增文章', description: 'coverType=image 时必须提供封面图数组，coverType=video 时必须提供视频地址。' })
  @ApiBody({ type: CreateArticleDto })
  @ApiOkResponse({ description: '新建的 ArticleDetailVo' })
  async create(@Body() dto: CreateArticleDto): Promise<ArticleDetailVo> {
    return this.blogService.create(dto)
  }

  @Put(':id')
  @RequirePermissions(PERMISSIONS.BLOG_ARTICLE_UPDATE)
  @OperationLog({ module: 'blog:article', action: 'update', targetType: 'article' })
  @ApiOperation({ summary: '编辑文章', description: '字段全部可选；切换封面类型后服务端会重新校验封面完整性。' })
  @ApiBody({ type: UpdateArticleDto })
  @ApiOkResponse({ description: '更新后的 ArticleDetailVo' })
  async update(
    @Param('id', new ParseIntPipe({ errorHttpStatusCode: HttpStatus.BAD_REQUEST })) id: number,
    @Body() dto: UpdateArticleDto,
  ): Promise<ArticleDetailVo> {
    return this.blogService.update(id, dto)
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.BLOG_ARTICLE_DELETE)
  @OperationLog({ module: 'blog:article', action: 'delete', targetType: 'article' })
  @ApiOperation({ summary: '删除文章', description: '删除后自动清理前台列表缓存。' })
  @ApiOkResponse({ description: '删除成功，data 为 null' })
  async remove(
    @Param('id', new ParseIntPipe({ errorHttpStatusCode: HttpStatus.BAD_REQUEST })) id: number,
  ): Promise<null> {
    return this.blogService.remove(id)
  }

  @Patch(':id/publish')
  @RequirePermissions(PERMISSIONS.BLOG_ARTICLE_UPDATE)
  @OperationLog({ module: 'blog:article', action: 'update', targetType: 'article' })
  @ApiOperation({ summary: '切换上下架状态', description: 'body { value: boolean }。' })
  @ApiBody({ type: ToggleArticleDto })
  @ApiOkResponse({ description: '更新后的 ArticleListItemVo' })
  async togglePublish(
    @Param('id', new ParseIntPipe({ errorHttpStatusCode: HttpStatus.BAD_REQUEST })) id: number,
    @Body() dto: ToggleArticleDto,
  ): Promise<ArticleListItemVo> {
    return this.blogService.togglePublish(id, dto.value)
  }

  @Patch(':id/recommend')
  @RequirePermissions(PERMISSIONS.BLOG_ARTICLE_UPDATE)
  @OperationLog({ module: 'blog:article', action: 'update', targetType: 'article' })
  @ApiOperation({ summary: '切换首页推荐位', description: 'body { value: boolean }。' })
  @ApiBody({ type: ToggleArticleDto })
  @ApiOkResponse({ description: '更新后的 ArticleListItemVo' })
  async toggleRecommend(
    @Param('id', new ParseIntPipe({ errorHttpStatusCode: HttpStatus.BAD_REQUEST })) id: number,
    @Body() dto: ToggleArticleDto,
  ): Promise<ArticleListItemVo> {
    return this.blogService.toggleRecommend(id, dto.value)
  }

  @Patch(':id/sort')
  @RequirePermissions(PERMISSIONS.BLOG_ARTICLE_UPDATE)
  @OperationLog({ module: 'blog:article', action: 'update', targetType: 'article' })
  @ApiOperation({ summary: '更新首页排序权重', description: 'body { sort: number }，数字越大越靠前。' })
  @ApiBody({ type: SortArticleDto })
  @ApiOkResponse({ description: '更新后的 ArticleListItemVo' })
  async updateSort(
    @Param('id', new ParseIntPipe({ errorHttpStatusCode: HttpStatus.BAD_REQUEST })) id: number,
    @Body() dto: SortArticleDto,
  ): Promise<ArticleListItemVo> {
    return this.blogService.updateSort(id, dto.sort)
  }
}
