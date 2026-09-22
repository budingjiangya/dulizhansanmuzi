/**
 * 角色服务
 * 业务规则：
 * 1. 权限码必须是 contracts 中登记过的合法值（拒绝未知权限码，避免脏数据让守卫静默失效）；
 * 2. 内置角色（超级管理员 / 内容编辑）不允许删除；
 * 3. 仍有账号占用的角色不允许删除（返回 40900）；
 * 4. 列表返回 userCount，供后台删除前提示。
 */
import { Injectable, Logger } from '@nestjs/common'
import { ALL_PERMISSIONS, PERMISSIONS, RoleId, type AdminRoleVo } from '@sanmuzi/contracts'
import { BizException } from '../../common/exceptions/biz.exception'
import { stringifyJsonArray, parseJsonArray } from '../../common/utils/json.util'
import { formatDateTime } from '../../common/utils/admin-user.util'
import { PrismaService } from '../../prisma/prisma.service'
import type { CreateAdminRoleDto } from './dto/create-admin-role.dto'
import type { UpdateAdminRoleDto } from './dto/update-admin-role.dto'

/** 内置角色 ID 列表（不允许删除） */
const BUILT_IN_ROLE_IDS: number[] = [RoleId.SUPER_ADMIN, RoleId.CONTENT_EDITOR]

/** 合法权限码集合 */
const VALID_PERMISSION_CODES = new Set<string>(Object.values(PERMISSIONS))

/** 数据库角色记录形状 */
interface AdminRoleRow {
  id: number
  roleName: string
  permissions: string
  createdAt: Date
  updatedAt: Date
  _count?: { adminUsers: number }
}

@Injectable()
export class AdminRoleService {
  private readonly logger = new Logger(AdminRoleService.name)

  constructor(private readonly prisma: PrismaService) {}

  /**
   * 全部角色（带账号数量）
   * 角色数量是有限集合（当前两个内置角色 + 少量自定义角色），且前端角色页与账号页都需要全量数据，
   * 因此按 contracts 约定直接返回数组，不做分页包装。
   */
  async listAll(): Promise<AdminRoleVo[]> {
    const rows = await this.prisma.adminRole.findMany({
      orderBy: [{ id: 'asc' }],
      include: { _count: { select: { adminUsers: true } } },
    })
    return rows.map((row) => this.mapRole(row))
  }

  /** 新增角色 */
  async create(dto: CreateAdminRoleDto): Promise<AdminRoleVo> {
    const roleName = dto.roleName.trim()
    await this.assertRoleNameAvailable(roleName)
    const permissions = this.normalizePermissions(dto.permissions)

    const created = await this.prisma.adminRole.create({
      data: { roleName, permissions: stringifyJsonArray(permissions) },
      include: { _count: { select: { adminUsers: true } } },
    })
    this.logger.log(`新增角色：${created.roleName}（${permissions.length} 项权限）`)
    return this.mapRole(created)
  }

  /** 编辑角色 */
  async update(id: number, dto: UpdateAdminRoleDto): Promise<AdminRoleVo> {
    const current = await this.findByIdOrFail(id)

    let roleName = current.roleName
    if (dto.roleName !== undefined && dto.roleName.trim() !== current.roleName) {
      roleName = dto.roleName.trim()
      await this.assertRoleNameAvailable(roleName)
    }

    const permissions =
      dto.permissions === undefined ? parseJsonArray(current.permissions) : this.normalizePermissions(dto.permissions)

    const updated = await this.prisma.adminRole.update({
      where: { id },
      data: { roleName, permissions: stringifyJsonArray(permissions) },
      include: { _count: { select: { adminUsers: true } } },
    })
    this.logger.log(`更新角色：${updated.roleName}（id=${id}，${permissions.length} 项权限）`)
    return this.mapRole(updated)
  }

  /** 删除角色 */
  async remove(id: number): Promise<null> {
    const current = await this.findByIdOrFail(id)
    if (BUILT_IN_ROLE_IDS.includes(id)) {
      throw BizException.conflict(`「${current.roleName}」是系统内置角色，不允许删除`)
    }

    const userCount = await this.prisma.adminUser.count({ where: { roleId: id } })
    if (userCount > 0) {
      throw BizException.conflict(`该角色下仍有 ${userCount} 个账号，请先调整账号角色后再删除`)
    }

    await this.prisma.adminRole.delete({ where: { id } })
    this.logger.log(`删除角色：${current.roleName}（id=${id}）`)
    return null
  }

  /** 查询角色，不存在抛 40400 */
  private async findByIdOrFail(id: number): Promise<AdminRoleRow> {
    const role = await this.prisma.adminRole.findUnique({ where: { id } })
    if (!role) throw BizException.notFound('角色不存在')
    return role
  }

  /** 角色名唯一性校验 */
  private async assertRoleNameAvailable(roleName: string): Promise<void> {
    const exists = await this.prisma.adminRole.findFirst({ where: { roleName }, select: { id: true } })
    if (exists) throw BizException.conflict(`角色名称「${roleName}」已存在`)
  }

  /** 权限码校验 + 去重（保持 contracts 的声明顺序，便于前端展示一致） */
  private normalizePermissions(input: string[]): string[] {
    const unique = Array.from(new Set(input.map((item) => item.trim()).filter((item) => item !== '')))
    if (unique.length === 0) throw BizException.paramInvalid('至少选择一个权限')
    const invalid = unique.filter((code) => !VALID_PERMISSION_CODES.has(code))
    if (invalid.length > 0) {
      throw BizException.paramInvalid(`存在未登记的权限码：${invalid.join('、')}`)
    }
    const ordered = ALL_PERMISSIONS.filter((code) => unique.includes(code))
    const extra = unique.filter((code) => !ordered.includes(code as (typeof ALL_PERMISSIONS)[number]))
    return [...ordered, ...extra]
  }

  /** 数据库记录 -> 契约 AdminRoleVo */
  private mapRole(row: AdminRoleRow): AdminRoleVo {
    return {
      id: row.id,
      roleName: row.roleName,
      permissions: parseJsonArray(row.permissions),
      createdAt: formatDateTime(row.createdAt) ?? '',
      updatedAt: formatDateTime(row.updatedAt) ?? '',
      userCount: row._count?.adminUsers ?? 0,
    }
  }
}
