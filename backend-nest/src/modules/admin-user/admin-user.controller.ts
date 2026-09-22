/**
 * 管理员账号控制器
 * 路由前缀 /admin/users，全部接口需要对应权限码。
 */
import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseIntPipe, Post, Put, Query } from '@nestjs/common'
import { ApiBearerAuth, ApiBody, ApiOkResponse, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger'
import { PERMISSIONS, type AdminUserVo, type PageResult } from '@sanmuzi/contracts'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { RequirePermissions } from '../../common/decorators/permissions.decorator'
import { AdminUserService } from './admin-user.service'
import { CreateAdminUserDto } from './dto/create-admin-user.dto'
import { QueryAdminUserDto } from './dto/query-admin-user.dto'
import { ResetPasswordDto } from './dto/reset-password.dto'
import { UpdateAdminUserDto } from './dto/update-admin-user.dto'

@ApiTags('账号管理')
@ApiBearerAuth()
@Controller('admin/users')
export class AdminUserController {
  constructor(private readonly adminUserService: AdminUserService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.SYSTEM_USER_LIST)
  @ApiOperation({ summary: '分页查询管理员账号', description: '支持 username / realName 模糊与 roleId / status 精确筛选。' })
  @ApiOkResponse({ description: 'PageResult<AdminUserVo>' })
  async list(@Query() query: QueryAdminUserDto): Promise<PageResult<AdminUserVo>> {
    return this.adminUserService.list(query)
  }

  @Post()
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PERMISSIONS.SYSTEM_USER_CREATE)
  @ApiOperation({ summary: '新增管理员账号', description: '密码使用 bcrypt 加密；用户名重复返回 40900。' })
  @ApiBody({ type: CreateAdminUserDto })
  @ApiOkResponse({ description: '新建的 AdminUserVo' })
  @ApiResponse({ status: 409, description: '用户名已存在（40900）' })
  async create(@Body() dto: CreateAdminUserDto): Promise<AdminUserVo> {
    return this.adminUserService.create(dto)
  }

  @Put(':id')
  @RequirePermissions(PERMISSIONS.SYSTEM_USER_UPDATE)
  @ApiOperation({ summary: '编辑管理员账号', description: '不允许把最后一个启用状态的超管禁用或降级（40900）。' })
  @ApiBody({ type: UpdateAdminUserDto })
  @ApiOkResponse({ description: '更新后的 AdminUserVo' })
  async update(
    @Param('id', new ParseIntPipe({ errorHttpStatusCode: HttpStatus.BAD_REQUEST })) id: number,
    @Body() dto: UpdateAdminUserDto,
  ): Promise<AdminUserVo> {
    return this.adminUserService.update(id, dto)
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.SYSTEM_USER_DELETE)
  @ApiOperation({ summary: '删除管理员账号', description: '禁止删除自己，禁止删除最后一个超管（40900）。' })
  @ApiOkResponse({ description: '删除成功，data 为 null' })
  async remove(
    @Param('id', new ParseIntPipe({ errorHttpStatusCode: HttpStatus.BAD_REQUEST })) id: number,
    @CurrentUser() user: { userId: number },
  ): Promise<null> {
    return this.adminUserService.remove(id, user.userId)
  }

  @Post(':id/reset-password')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PERMISSIONS.SYSTEM_USER_RESET_PWD)
  @ApiOperation({ summary: '重置指定账号密码', description: '新密码 bcrypt 加密后写入。' })
  @ApiBody({ type: ResetPasswordDto })
  @ApiOkResponse({ description: '重置成功，data 为 null' })
  async resetPassword(
    @Param('id', new ParseIntPipe({ errorHttpStatusCode: HttpStatus.BAD_REQUEST })) id: number,
    @Body() dto: ResetPasswordDto,
  ): Promise<null> {
    return this.adminUserService.resetPassword(id, dto)
  }
}
