/**
 * 前台门户模块
 * 复用 BlogModule 导出的 BlogService 读取文章数据。
 */
import { Module } from '@nestjs/common'
import { BlogModule } from '../blog/blog.module'
import { PortalController } from './portal.controller'
import { PortalService } from './portal.service'

@Module({
  imports: [BlogModule],
  controllers: [PortalController],
  providers: [PortalService],
})
export class PortalModule {}
