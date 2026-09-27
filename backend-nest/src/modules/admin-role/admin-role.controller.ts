/**
 * 角色控制器
 * 路由前缀 /admin/roles。
 */
import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseIntPipe, Post, Put } from '@nestjs/common'
import { ApiBearerAuth, ApiBody, ApiOkResponse, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger'
import { PERMISSIONS, type AdminRoleVo } from '@sanmuzi/contracts'
import { OperationLog } from '../../common/decorators/operation-log.decorator'
import { RequirePermissions } from '../../common/decorators/permissions.decorator'
import { AdminRoleService } from './admin-role.service'
import { CreateAdminRoleDto } from './dto/create-admin-role.dto'
import { UpdateAdminRoleDto } from './dto/update-admin-role.dto'

@ApiTags('角色管理')
@ApiBearerAuth()
@Controller('admin/roles')
export class AdminRoleController {
  constructor(private readonly adminRoleService: AdminRoleService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.SYSTEM_ROLE_LIST)
  @ApiOperation({
    summary: '查询全部角色',
    description: '不分页，返回 contracts 约定的 AdminRoleVo 数组，含各角色下的账号数量 userCount。',
  })
  @ApiOkResponse({ description: 'AdminRoleVo 数组' })
  async list(): Promise<AdminRoleVo[]> {
    return this.adminRoleService.listAll()
  }

  @Get('options')
  @RequirePermissions(PERMISSIONS.SYSTEM_ROLE_LIST)
  @ApiOperation({ summary: '全部角色选项', description: '与 GET /admin/roles 等价，语义化别名，供账号编辑页角色下拉使用。' })
  @ApiOkResponse({ description: 'AdminRoleVo 数组' })
  async options(): Promise<AdminRoleVo[]> {
    return this.adminRoleService.listAll()
  }

  @Post()
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PERMISSIONS.SYSTEM_ROLE_CREATE)
  @OperationLog({ module: 'system:role', action: 'create', targetType: 'role' })
  @ApiOperation({ summary: '新增角色', description: '权限码必须来自 contracts 登记集合，非法权限码返回 40000。' })
  @ApiBody({ type: CreateAdminRoleDto })
  @ApiOkResponse({ description: '新建的 AdminRoleVo' })
  async create(@Body() dto: CreateAdminRoleDto): Promise<AdminRoleVo> {
    return this.adminRoleService.create(dto)
  }

  @Put(':id')
  @RequirePermissions(PERMISSIONS.SYSTEM_ROLE_UPDATE)
  @OperationLog({ module: 'system:role', action: 'update', targetType: 'role' })
  @ApiOperation({ summary: '编辑角色', description: '权限数组为覆盖式更新。' })
  @ApiBody({ type: UpdateAdminRoleDto })
  @ApiOkResponse({ description: '更新后的 AdminRoleVo' })
  async update(
    @Param('id', new ParseIntPipe({ errorHttpStatusCode: HttpStatus.BAD_REQUEST })) id: number,
    @Body() dto: UpdateAdminRoleDto,
  ): Promise<AdminRoleVo> {
    return this.adminRoleService.update(id, dto)
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.SYSTEM_ROLE_DELETE)
  @OperationLog({ module: 'system:role', action: 'delete', targetType: 'role' })
  @ApiOperation({
    summary: '删除角色',
    description: '内置角色（超级管理员 / 内容编辑）与仍被账号占用的角色不允许删除（40900）。',
  })
  @ApiOkResponse({ description: '删除成功，data 为 null' })
  @ApiResponse({ status: 409, description: '内置角色或仍有账号占用（40900）' })
  async remove(@Param('id', new ParseIntPipe({ errorHttpStatusCode: HttpStatus.BAD_REQUEST })) id: number): Promise<null> {
    return this.adminRoleService.remove(id)
  }
}
