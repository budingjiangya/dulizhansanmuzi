/**
 * 角色模块
 */
import { Module } from '@nestjs/common'
import { AdminRoleController } from './admin-role.controller'
import { AdminRoleService } from './admin-role.service'

@Module({
  controllers: [AdminRoleController],
  providers: [AdminRoleService],
  exports: [AdminRoleService],
})
export class AdminRoleModule {}
