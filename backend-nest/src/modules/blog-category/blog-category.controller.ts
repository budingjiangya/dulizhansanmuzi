/**
 * 文章分类控制器（管理端）
 * 路由前缀 /admin/categories，业务逻辑全部在 BlogCategoryService。
 */
import { Body, Controller, Delete, Get, HttpStatus, Param, ParseIntPipe, Post, Put } from '@nestjs/common'
import { ApiBearerAuth, ApiBody, ApiOkResponse, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger'
import { PERMISSIONS, type CategoryVo } from '@sanmuzi/contracts'
import { OperationLog } from '../../common/decorators/operation-log.decorator'
import { RequirePermissions } from '../../common/decorators/permissions.decorator'
import { BlogCategoryService } from './blog-category.service'
import { CreateBlogCategoryDto } from './dto/create-blog-category.dto'
import { UpdateBlogCategoryDto } from './dto/update-blog-category.dto'

@ApiTags('分类管理')
@ApiBearerAuth()
@Controller('admin/categories')
export class BlogCategoryController {
  constructor(private readonly blogCategoryService: BlogCategoryService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.BLOG_CATEGORY_LIST)
  @ApiOperation({
    summary: '查询全部分类',
    description:
      '不分页，返回 contracts 约定的 CategoryVo 数组，按 sort desc, id asc 排序，并含各分类下的文章数量 articleCount。',
  })
  @ApiOkResponse({ description: 'CategoryVo 数组' })
  async list(): Promise<CategoryVo[]> {
    return this.blogCategoryService.listAll()
  }

  @Post()
  @RequirePermissions(PERMISSIONS.BLOG_CATEGORY_CREATE)
  @OperationLog({ module: 'blog:category', action: 'create', targetType: 'category' })
  @ApiOperation({ summary: '新增分类', description: '分类名必填、最长 64 字且全局唯一；重名返回 40900。' })
  @ApiBody({ type: CreateBlogCategoryDto })
  @ApiOkResponse({ description: '新建的 CategoryVo' })
  @ApiResponse({ status: 409, description: '分类名称已存在（40900）' })
  async create(@Body() dto: CreateBlogCategoryDto): Promise<CategoryVo> {
    return this.blogCategoryService.create(dto)
  }

  @Put(':id')
  @RequirePermissions(PERMISSIONS.BLOG_CATEGORY_UPDATE)
  @OperationLog({ module: 'blog:category', action: 'update', targetType: 'category' })
  @ApiOperation({ summary: '编辑分类', description: '字段全部可选；改名时校验重名（40900），分类不存在返回 40400。' })
  @ApiBody({ type: UpdateBlogCategoryDto })
  @ApiOkResponse({ description: '更新后的 CategoryVo' })
  @ApiResponse({ status: 404, description: '分类不存在（40400）' })
  @ApiResponse({ status: 409, description: '分类名称已存在（40900）' })
  async update(
    @Param('id', new ParseIntPipe({ errorHttpStatusCode: HttpStatus.BAD_REQUEST })) id: number,
    @Body() dto: UpdateBlogCategoryDto,
  ): Promise<CategoryVo> {
    return this.blogCategoryService.update(id, dto)
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.BLOG_CATEGORY_DELETE)
  @OperationLog({ module: 'blog:category', action: 'delete', targetType: 'category' })
  @ApiOperation({
    summary: '删除分类',
    description: '分类下仍有文章时返回 40900 并在消息中写明剩余文章数；分类不存在返回 40400。',
  })
  @ApiOkResponse({ description: '删除成功，data 为 null' })
  @ApiResponse({ status: 404, description: '分类不存在（40400）' })
  @ApiResponse({ status: 409, description: '该分类下仍有文章（40900）' })
  async remove(
    @Param('id', new ParseIntPipe({ errorHttpStatusCode: HttpStatus.BAD_REQUEST })) id: number,
  ): Promise<null> {
    return this.blogCategoryService.remove(id)
  }
}
