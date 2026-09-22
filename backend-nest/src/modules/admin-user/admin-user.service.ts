/**
 * 管理员账号服务
 * 业务规则：
 * 1. 用户名唯一，重复返回 40900；
 * 2. 系统必须始终保留至少一个「启用状态的超级管理员」，禁止把最后一个超管禁用/降级/删除；
 * 3. 密码一律 bcrypt 加密存储，接口永不返回密码字段；
 * 4. 禁止删除当前登录账号（避免自锁）。
 */
import { Injectable, Logger } from '@nestjs/common'
import { AdminStatus, RoleId, type AdminUserVo, type PageResult } from '@sanmuzi/contracts'
import * as bcrypt from 'bcryptjs'
import { BizException } from '../../common/exceptions/biz.exception'
import { buildPageResult, normalizePaging } from '../../common/utils/pagination.util'
import { formatDateTime } from '../../common/utils/admin-user.util'
import { BCRYPT_SALT_ROUNDS } from '../auth/auth.service'
import { PrismaService } from '../../prisma/prisma.service'
import type { CreateAdminUserDto } from './dto/create-admin-user.dto'
import type { QueryAdminUserDto } from './dto/query-admin-user.dto'
import type { ResetPasswordDto } from './dto/reset-password.dto'
import type { UpdateAdminUserDto } from './dto/update-admin-user.dto'

/** 查询时携带的角色字段 */
const ROLE_SELECT = { select: { roleName: true } } as const

/** 数据库查询结果形状 */
interface AdminUserWithRole {
  id: number
  username: string
  realName: string
  roleId: number
  status: number
  lastLoginAt: Date | null
  createdAt: Date
  updatedAt: Date
  role: { roleName: string } | null
}

@Injectable()
export class AdminUserService {
  private readonly logger = new Logger(AdminUserService.name)

  constructor(private readonly prisma: PrismaService) {}

  /** 分页查询账号列表（username / realName / roleId / status 筛选） */
  async list(query: QueryAdminUserDto): Promise<PageResult<AdminUserVo>> {
    const { page, pageSize, skip, take } = normalizePaging(query.page, query.pageSize)

    const where = {
      ...(query.username ? { username: { contains: query.username } } : {}),
      ...(query.realName ? { realName: { contains: query.realName } } : {}),
      ...(query.roleId !== undefined ? { roleId: query.roleId } : {}),
      ...(query.status !== undefined ? { status: query.status } : {}),
    }

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.adminUser.count({ where }),
      this.prisma.adminUser.findMany({
        where,
        skip,
        take,
        orderBy: [{ id: 'asc' }],
        include: { role: ROLE_SELECT },
      }),
    ])

    return buildPageResult(rows.map((row) => this.mapUser(row)), total, page, pageSize)
  }

  /** 新增账号 */
  async create(dto: CreateAdminUserDto): Promise<AdminUserVo> {
    const username = dto.username.trim()
    await this.assertUsernameAvailable(username)
    await this.assertRoleExists(dto.roleId)

    const created = await this.prisma.adminUser.create({
      data: {
        username,
        password: await bcrypt.hash(dto.password, BCRYPT_SALT_ROUNDS),
        realName: dto.realName.trim(),
        roleId: dto.roleId,
        status: dto.status ?? AdminStatus.ENABLED,
      },
      include: { role: ROLE_SELECT },
    })
    this.logger.log(`新增管理员账号：${created.username}（角色 ${created.roleId}）`)
    return this.mapUser(created)
  }

  /** 编辑账号（含「最后一个超管」保护） */
  async update(id: number, dto: UpdateAdminUserDto): Promise<AdminUserVo> {
    const current = await this.findByIdOrFail(id)

    if (dto.username !== undefined && dto.username.trim() !== current.username) {
      await this.assertUsernameAvailable(dto.username.trim())
    }
    if (dto.roleId !== undefined && dto.roleId !== current.roleId) {
      await this.assertRoleExists(dto.roleId)
    }

    const nextRoleId = dto.roleId ?? current.roleId
    const nextStatus = dto.status ?? (current.status === 1 ? AdminStatus.ENABLED : AdminStatus.DISABLED)
    const losingSuperAdmin =
      current.roleId === RoleId.SUPER_ADMIN &&
      current.status === AdminStatus.ENABLED &&
      (nextRoleId !== RoleId.SUPER_ADMIN || nextStatus !== AdminStatus.ENABLED)
    if (losingSuperAdmin && (await this.countEnabledSuperAdmins(id)) === 0) {
      throw BizException.conflict('系统必须保留至少一个启用状态的超级管理员，无法禁用或降级最后一个超管')
    }

    const updated = await this.prisma.adminUser.update({
      where: { id },
      data: {
        ...(dto.username !== undefined ? { username: dto.username.trim() } : {}),
        ...(dto.realName !== undefined ? { realName: dto.realName.trim() } : {}),
        ...(dto.roleId !== undefined ? { roleId: dto.roleId } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
      },
      include: { role: ROLE_SELECT },
    })
    this.logger.log(`更新管理员账号：${updated.username}（id=${id}）`)
    return this.mapUser(updated)
  }

  /** 删除账号（禁止删除自己、禁止删除最后一个超管） */
  async remove(id: number, operatorId: number): Promise<null> {
    const current = await this.findByIdOrFail(id)
    if (id === operatorId) throw BizException.conflict('不能删除当前登录的账号')

    if (current.roleId === RoleId.SUPER_ADMIN && (await this.countEnabledSuperAdmins(id)) === 0) {
      throw BizException.conflict('系统必须保留至少一个启用状态的超级管理员，无法删除最后一个超管')
    }

    await this.prisma.adminUser.delete({ where: { id } })
    this.logger.log(`删除管理员账号：${current.username}（id=${id}）`)
    return null
  }

  /** 重置指定账号密码 */
  async resetPassword(id: number, dto: ResetPasswordDto): Promise<null> {
    const current = await this.findByIdOrFail(id)
    await this.prisma.adminUser.update({
      where: { id },
      data: { password: await bcrypt.hash(dto.newPassword, BCRYPT_SALT_ROUNDS) },
    })
    this.logger.log(`重置账号密码：${current.username}（id=${id}）`)
    return null
  }

  /** 查询账号，不存在抛 40400 */
  private async findByIdOrFail(id: number): Promise<AdminUserWithRole> {
    const user = await this.prisma.adminUser.findUnique({ where: { id }, include: { role: ROLE_SELECT } })
    if (!user) throw BizException.notFound('管理员账号不存在')
    return user
  }

  /** 用户名唯一性校验 */
  private async assertUsernameAvailable(username: string): Promise<void> {
    const exists = await this.prisma.adminUser.findUnique({ where: { username }, select: { id: true } })
    if (exists) throw BizException.conflict(`用户名「${username}」已存在`)
  }

  /** 角色存在性校验 */
  private async assertRoleExists(roleId: number): Promise<void> {
    const role = await this.prisma.adminRole.findUnique({ where: { id: roleId }, select: { id: true } })
    if (!role) throw BizException.notFound('所选角色不存在')
  }

  /** 统计「排除指定账号后」仍处于启用状态的超管数量 */
  private async countEnabledSuperAdmins(excludeId: number): Promise<number> {
    return this.prisma.adminUser.count({
      where: { roleId: RoleId.SUPER_ADMIN, status: AdminStatus.ENABLED, id: { not: excludeId } },
    })
  }

  /** 数据库记录 -> 契约 AdminUserVo（不包含密码） */
  private mapUser(row: AdminUserWithRole): AdminUserVo {
    return {
      id: row.id,
      username: row.username,
      realName: row.realName,
      roleId: row.roleId,
      roleName: row.role?.roleName ?? '未知角色',
      status: (row.status === 1 ? 1 : 0) as AdminUserVo['status'],
      lastLoginAt: formatDateTime(row.lastLoginAt),
      createdAt: formatDateTime(row.createdAt) ?? '',
      updatedAt: formatDateTime(row.updatedAt) ?? '',
    }
  }
}
